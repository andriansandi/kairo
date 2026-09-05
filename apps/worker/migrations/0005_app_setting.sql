-- 0005: application settings (engine thresholds, AI model config) stored as
-- typed JSON documents keyed by name. Written by W-ai/W-core lanes; read at
-- snapshot rebuild (conflict thresholds) and by the AI layer (model config).

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
