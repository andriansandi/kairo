PRAGMA foreign_keys = ON;

CREATE TABLE timeline_import_row (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES timeline_import(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valid', 'warning', 'error')),
  issues TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_timeline_import_row_import_id ON timeline_import_row(import_id);
