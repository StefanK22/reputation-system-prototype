CREATE TABLE IF NOT EXISTS reputation_configurations (
  config_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  activation_time TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (config_id, version)
);

CREATE INDEX IF NOT EXISTS idx_reputation_configurations_activation_time
  ON reputation_configurations (activation_time DESC);

CREATE TABLE IF NOT EXISTS reputation_subjects (
  party TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  overall_score NUMERIC(10, 2) NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_subjects_overall_score
  ON reputation_subjects (overall_score DESC);

CREATE TABLE IF NOT EXISTS engine_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_processed_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO engine_state (id, last_processed_offset)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
