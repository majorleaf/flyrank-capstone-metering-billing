CREATE TABLE job_runs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job               TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    checked           INTEGER NOT NULL DEFAULT 0,
    drift_fixed       INTEGER NOT NULL DEFAULT 0,
    error             TEXT,
    started_at        TIMESTAMPZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPZ,
);
CREATE INDEX job_runs_job_started_idx ON jobs_runs (job, started_at);