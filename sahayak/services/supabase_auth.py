"""
Sahayak AI — Supabase Authentication Service
Replaces Firebase Auth.

Flow:
  1. User signs in via Supabase client on frontend
  2. Supabase returns an access_token (signed JWT)
  3. Frontend sends: Authorization: Bearer <supabase_access_token>
  4. Backend verifies via Supabase Admin API (get_user)
  5. User UID + email extracted → local DB record created/fetched

Setup:
  - Set SUPABASE_URL and SUPABASE_KEY (service role key) in .env
"""
import os
import logging
from typing import Optional

logger = logging.getLogger("sahayak.supabase_auth")

_supabase_client = None
_supabase_available = False


def _get_client():
    global _supabase_client, _supabase_available
    if _supabase_available:
        return _supabase_client
    if _supabase_client is False:   # already failed
        return None

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        logger.warning("SUPABASE_URL / SUPABASE_KEY not set — Supabase auth disabled")
        _supabase_client = False
        return None

    try:
        from supabase import create_client
        _supabase_client = create_client(url, key)
        _supabase_available = True
        logger.info("Supabase client initialised ✓")
        return _supabase_client
    except Exception as exc:
        logger.error("Supabase init failed: %s", exc)
        _supabase_client = False
        return None


def supabase_is_configured() -> bool:
    return _get_client() is not None and _get_client() is not False


def verify_supabase_token(token: str) -> Optional[dict]:
    """
    Verify a Supabase access_token via the Admin API.
    Returns {"uid": str, "email": str, "name": str} or None.
    """
    client = _get_client()
    if not client:
        return None
    try:
        response = client.auth.get_user(token)
        if response and response.user:
            u = response.user
            meta = u.user_metadata or {}
            name = (
                meta.get("full_name")
                or meta.get("name")
                or (u.email.split("@")[0].title() if u.email else "User")
            )
            return {"uid": u.id, "email": u.email or "", "name": name}
    except Exception as exc:
        logger.debug("Supabase token verification failed: %s", exc)
    return None


def get_or_create_supabase_user(uid: str, email: str, name: str, role: str, db):
    """
    Get existing user by supabase_uid (stored in firebase_uid column for compatibility),
    or create a new one with the given role.
    Always updates role if the caller explicitly passes one.
    """
    from db.database import User, Patient
    from services.auth_service import generate_share_code

    valid_roles = ("patient", "doctor", "asha")
    safe_role = role if role in valid_roles else "patient"

    # Look up by supabase UID (we reuse firebase_uid column)
    user = db.query(User).filter(User.firebase_uid == uid).first()
    if user:
        if user.role != safe_role:
            user.role = safe_role
            db.commit()
        return user

    # Also check by email
    user = db.query(User).filter(User.email == email.lower()).first()
    if user:
        user.firebase_uid = uid
        if user.role != safe_role:
            user.role = safe_role
        db.commit()
        return user

    # Create new user
    safe_name = name or email.split("@")[0].title()
    user = User(
        email=email.lower(),
        password_hash="supabase_auth",
        full_name=safe_name,
        role=safe_role,
        firebase_uid=uid,   # reusing column for supabase UID
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Auto-create patient profile
    if user.role == "patient":
        share = generate_share_code()
        while db.query(Patient).filter(Patient.share_code == share).first():
            share = generate_share_code()
        patient = Patient(
            user_id=user.id,
            firebase_uid=uid,
            name=user.full_name,
            age=0,
            gender="Not specified",
            email=email.lower(),
            share_code=share,
            share_code_active=True,
        )
        db.add(patient)

    db.commit()
    logger.info("New Supabase user created: uid=%s role=%s", uid, user.role)
    return user
