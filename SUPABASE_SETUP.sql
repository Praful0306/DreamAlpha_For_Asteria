-- Sahayak AI — Government Database Setup
-- Run this once in: https://supabase.com/dashboard/project/ryjpabdvyuchgllxhukk/sql/new

CREATE TABLE IF NOT EXISTS diagnosis_log (
    id             BIGSERIAL PRIMARY KEY,
    local_id       INTEGER UNIQUE,
    patient_id     INTEGER,
    district       TEXT DEFAULT 'Unknown',
    disease_name   TEXT,
    risk_level     TEXT,
    confidence_pct REAL,
    recorded_at    TIMESTAMPTZ DEFAULT NOW(),
    source         TEXT DEFAULT 'Sahayak AI — AMD Ryzen AI NPU',
    synced_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast government dashboard queries
CREATE INDEX IF NOT EXISTS idx_diagnosis_log_district  ON diagnosis_log(district);
CREATE INDEX IF NOT EXISTS idx_diagnosis_log_risk      ON diagnosis_log(risk_level);
CREATE INDEX IF NOT EXISTS idx_diagnosis_log_recorded  ON diagnosis_log(recorded_at);
CREATE INDEX IF NOT EXISTS idx_diagnosis_log_disease   ON diagnosis_log(disease_name);

-- Enable Row Level Security (recommended for production)
ALTER TABLE diagnosis_log ENABLE ROW LEVEL SECURITY;

-- Allow service_role to read/write everything (backend sync)
CREATE POLICY "Service role full access" ON diagnosis_log
    FOR ALL USING (auth.role() = 'service_role');

-- Test insert (delete after confirming)
-- INSERT INTO diagnosis_log (local_id, patient_id, district, disease_name, risk_level, confidence_pct, source)
-- VALUES (999, NULL, 'Dharwad', 'Test Entry', 'LOW', 100, 'Sahayak AI Setup Test');
