CREATE TABLE plane_member (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  person_id TEXT REFERENCES person(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_plane_member_person_id ON plane_member(person_id);
