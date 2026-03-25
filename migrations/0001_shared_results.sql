CREATE TABLE IF NOT EXISTS shared_results (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  template_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_results_expires_at
ON shared_results (expires_at);
