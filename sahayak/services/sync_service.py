"""
Sahayak AI — Hybrid Sync Service (SQLite → Supabase Government DB)
Pushes only unsynced diagnosis records to central Supabase PostgreSQL.

Design principles:
- NEVER touches the offline core. Reads from SQLite, writes to Supabase.
- Gracefully skips if SUPABASE_URL not in .env (zero crashes).
- Uses correct real DB table name: diagnosis_log (not "diagnoses").
- No schema changes needed on SQLite side.
- Returns safe status dict always.

To enable: add to .env
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_KEY=your-service-role-key
"""
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import text
from db.database import engine

logger = logging.getLogger("sahayak.sync")

# NOTE: Read from env at call-time (not module load) so dotenv is already loaded
def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "")

def _supabase_key() -> str:
    return os.getenv("SUPABASE_KEY", "")


def _ensure_table(client) -> None:
    """Create diagnosis_log table in Supabase if it doesn't exist."""
    try:
        client.rpc("create_diagnosis_log_if_missing", {}).execute()
    except Exception:
        pass  # Table already exists or RPC not needed — safe to ignore


def _get_supabase_client():
    """Lazy-load supabase client. Returns None if not configured."""
    url = _supabase_url()
    key = _supabase_key()
    if not url or not key:
        return None
    try:
        from supabase import create_client
        client = create_client(url, key)
        return client
    except ImportError:
        logger.warning("supabase-py not installed. Run: pip install supabase")
        return None
    except Exception as exc:
        logger.error("Supabase client init failed: %s", exc)
        return None


async def sync_to_government(days_back: int = 7) -> dict:
    """
    Reads diagnosis_log records from the last `days_back` days
    and pushes them to the Supabase government database.

    Returns a status dict — never raises.
    """
    client = _get_supabase_client()

    if not client:
        # Not configured — return a demo-friendly response
        return {
            "status": "not_configured",
            "message": (
                "Supabase not configured. "
                "Add SUPABASE_URL + SUPABASE_KEY to .env to enable sync."
            ),
            "records_found": 0,
            "records_pushed": 0,
            "demo_mode": True,
        }

    # Verify table exists first
    try:
        client.table("diagnosis_log").select("id").limit(1).execute()
    except Exception as tbl_err:
        err_str = str(tbl_err)
        if "PGRST205" in err_str or "schema cache" in err_str or "does not exist" in err_str.lower():
            logger.error(
                "diagnosis_log table missing in Supabase. "
                "Run this SQL in Supabase Dashboard → SQL Editor:\n\n"
                "CREATE TABLE IF NOT EXISTS diagnosis_log (\n"
                "  id BIGSERIAL PRIMARY KEY, local_id INTEGER UNIQUE,\n"
                "  patient_id INTEGER, district TEXT DEFAULT 'Unknown',\n"
                "  disease_name TEXT, risk_level TEXT, confidence_pct REAL,\n"
                "  recorded_at TIMESTAMPTZ DEFAULT NOW(),\n"
                "  source TEXT DEFAULT 'Sahayak AI — AMD Ryzen AI NPU',\n"
                "  synced_at TIMESTAMPTZ DEFAULT NOW()\n"
                ");"
            )
            return {
                "status": "table_missing",
                "message": "diagnosis_log table not found in Supabase. Create it via Supabase Dashboard → SQL Editor.",
                "setup_sql": (
                    "CREATE TABLE IF NOT EXISTS diagnosis_log ("
                    "id BIGSERIAL PRIMARY KEY, local_id INTEGER UNIQUE, "
                    "patient_id INTEGER, district TEXT DEFAULT 'Unknown', "
                    "disease_name TEXT, risk_level TEXT, confidence_pct REAL, "
                    "recorded_at TIMESTAMPTZ DEFAULT NOW(), "
                    "source TEXT DEFAULT 'Sahayak AI — AMD Ryzen AI NPU', "
                    "synced_at TIMESTAMPTZ DEFAULT NOW());"
                ),
                "dashboard_url": "https://supabase.com/dashboard/project/ryjpabdvyuchgllxhukk/sql/new",
                "records_pushed": 0,
            }

    try:
        # Read recent diagnosis_log records (real table, verified schema)
        from datetime import timedelta
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=days_back)
        ).isoformat()

        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, patient_id, district, disease_name, "
                    "risk_level, confidence_pct, created_at "
                    "FROM diagnosis_log "
                    "WHERE created_at >= :cutoff "
                    "AND (synced_at IS NULL OR synced_at = '') "
                    "ORDER BY created_at DESC"
                ),
                {"cutoff": cutoff},
            ).fetchall()

        if not rows:
            return {
                "status": "nothing_to_sync",
                "message": f"No diagnosis records in last {days_back} days.",
                "records_found": 0,
                "records_pushed": 0,
            }

        pushed = 0
        errors = 0
        for row in rows:
            try:
                record = {
                    "local_id":      row[0],
                    "patient_id":    row[1],
                    "district":      row[2] or "Unknown",
                    "disease_name":  row[3],
                    "risk_level":    row[4],
                    "confidence_pct":row[5],
                    "recorded_at":   str(row[6]),
                    "source":        "Sahayak AI — AMD Ryzen AI NPU",
                }
                # upsert by local_id so duplicate syncs are safe
                client.table("diagnosis_log").upsert(
                    record, on_conflict="local_id"
                ).execute()
                # Mark as synced in local DB so we never double-push
                with engine.begin() as upd_conn:
                    upd_conn.execute(
                        text("UPDATE diagnosis_log SET synced_at = :now WHERE id = :id"),
                        {"now": datetime.now(timezone.utc).isoformat(), "id": row[0]},
                    )
                pushed += 1
            except Exception as row_exc:
                logger.warning("Row sync failed (id=%s): %s", row[0], row_exc)
                errors += 1

        logger.info(
            "Sync complete: %d pushed, %d errors (of %d total)",
            pushed, errors, len(rows)
        )
        return {
            "status": "success",
            "records_found": len(rows),
            "records_pushed": pushed,
            "errors": errors,
            "message": (
                f"{pushed} records synced to Karnataka Government DB. "
                "Edge core untouched."
            ),
        }

    except Exception as exc:
        logger.error("Sync failed: %s", exc)
        return {
            "status": "error",
            "error": str(exc),
            "records_pushed": 0,
            "message": "Sync failed — data safely queued locally.",
        }
