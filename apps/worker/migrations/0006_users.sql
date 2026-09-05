CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- default credentials admin/admin — must be changed after first login
INSERT INTO users (id, username, password_hash) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'pbkdf2$100000$2603271d1655924a871af7281d3c2718$7a41816ef4c19d9d6713984b4fbbf8cf57c340616d7434851f4c5a0d557c3249'
);
