PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- SOURCE — EXTERNAL (synced, read-only in KAIRO)
-- -----------------------------------------------------------------------------

CREATE TABLE sync_run (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('plane', 'xls')),
  type TEXT NOT NULL CHECK (type IN ('incremental', 'full')),
  cursor TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  stats TEXT NOT NULL DEFAULT '{}',
  errors TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE project (
  id TEXT PRIMARY KEY,
  plane_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  priority INTEGER,
  deadline TEXT,
  declared_start TEXT,
  declared_end TEXT,
  team_scope TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE work_item (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  plane_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
  priority INTEGER,
  assignee_ids TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  due_date TEXT,
  estimate_raw TEXT,
  estimate_normalized_hours REAL,
  cycle TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE phase (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  declared_start TEXT NOT NULL,
  declared_end TEXT NOT NULL,
  effort_hours REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'in_progress', 'done')) DEFAULT 'draft',
  source TEXT NOT NULL CHECK (source IN ('xls', 'manual', 'plane')) DEFAULT 'manual'
);

CREATE TABLE timeline_import (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  mapping TEXT NOT NULL DEFAULT '{}',
  row_report TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'rejected')) DEFAULT 'draft',
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE dependency (
  id TEXT PRIMARY KEY,
  from_project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  from_phase_id TEXT REFERENCES phase(id) ON DELETE CASCADE,
  to_project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  to_phase_id TEXT REFERENCES phase(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('plane', 'manual'))
);

-- -----------------------------------------------------------------------------
-- SOURCE — KAIRO-MANAGED (the people truth)
-- -----------------------------------------------------------------------------

CREATE TABLE role (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seniority_ladder TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  seniority INTEGER NOT NULL,
  hours_per_day REAL NOT NULL DEFAULT 8,
  overhead_pct REAL NOT NULL DEFAULT 0.2 CHECK (overhead_pct BETWEEN 0 AND 1),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('builder', 'devops', 'other'))
);

CREATE TABLE team_membership (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  UNIQUE (person_id, team_id)
);

CREATE TABLE skill (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE person_skill (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level IN (1, 2, 3, 4)),
  verified_by TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual', 'import', 'ai')),
  UNIQUE (person_id, skill_id)
);

CREATE TABLE allocation (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES phase(id) ON DELETE SET NULL,
  fte REAL NOT NULL CHECK (fte BETWEEN 0 AND 2),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed', 'planned', 'proposed')),
  source TEXT NOT NULL CHECK (source IN ('plane', 'manual', 'xls', 'ai')) DEFAULT 'manual'
);

CREATE TABLE pto_entry (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  dates TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL CHECK (type IN ('pto', 'holiday', 'sick', 'other')) DEFAULT 'pto'
);

CREATE TABLE org_calendar (
  id TEXT PRIMARY KEY,
  working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  holidays TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE jr_skill_requirement (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  min_level INTEGER NOT NULL CHECK (min_level IN (1, 2, 3, 4)),
  weight TEXT NOT NULL CHECK (weight IN ('must', 'nice')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai_confirmed')),
  UNIQUE (work_item_id, skill_id)
);

CREATE TABLE scenario_def (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  ops TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'saved', 'shared', 'archived')) DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- -----------------------------------------------------------------------------
-- DERIVED (computed, keyed to snapshot_id — disposable, recomputable)
-- -----------------------------------------------------------------------------

CREATE TABLE planning_snapshot (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  inputs_hash TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'unknown',
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (inputs_hash)
);

CREATE TABLE capacity_entry (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  gross_h REAL NOT NULL,
  pto_h REAL NOT NULL DEFAULT 0,
  overhead_h REAL NOT NULL DEFAULT 0,
  available_h REAL NOT NULL,
  planned_h REAL NOT NULL DEFAULT 0,
  utilization REAL NOT NULL DEFAULT 0,
  flags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE conflict (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  rule TEXT NOT NULL CHECK (rule IN ('C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10')),
  severity TEXT NOT NULL CHECK (severity IN ('healthy', 'warning', 'at_risk', 'critical')),
  person_id TEXT REFERENCES person(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES team(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES phase(id) ON DELETE CASCADE,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  metrics TEXT NOT NULL DEFAULT '{}',
  explanation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')) DEFAULT 'open'
);

CREATE TABLE match_result (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  work_item_id TEXT NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  breakdown TEXT NOT NULL DEFAULT '{}',
  gaps TEXT NOT NULL DEFAULT '[]',
  free_hours_in_window REAL NOT NULL DEFAULT 0,
  existing_commitments REAL NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL
);

CREATE TABLE feasibility_result (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  computed_start TEXT NOT NULL,
  computed_finish TEXT NOT NULL,
  slack_days REAL NOT NULL DEFAULT 0,
  buffer_days REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL CHECK (verdict IN ('healthy', 'warning', 'at_risk', 'critical')),
  drivers TEXT NOT NULL DEFAULT '[]',
  critical_path TEXT NOT NULL DEFAULT '[]',
  per_phase_load TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE scenario_diff (
  id TEXT PRIMARY KEY,
  base_snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL REFERENCES scenario_def(id) ON DELETE CASCADE,
  capacity_deltas TEXT NOT NULL DEFAULT '{}',
  conflict_changes TEXT NOT NULL DEFAULT '{}',
  feasibility_deltas TEXT NOT NULL DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- AI-GENERATED (advisory, never authoritative, never engine input)
-- -----------------------------------------------------------------------------

CREATE TABLE analysis (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES planning_snapshot(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('explain', 'recommend', 'compare', 'qa')),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  prompt_digest TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '{}',
  validation_result TEXT NOT NULL DEFAULT '{}',
  cited_fact_ids TEXT NOT NULL DEFAULT '[]',
  superseded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE skill_extraction (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_item(id) ON DELETE CASCADE,
  proposed TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX idx_allocation_person_id ON allocation(person_id);
CREATE INDEX idx_allocation_project_id ON allocation(project_id);
CREATE INDEX idx_capacity_entry_snapshot_person_week ON capacity_entry(snapshot_id, person_id, week_key);
CREATE INDEX idx_conflict_snapshot_severity_status ON conflict(snapshot_id, severity, status);
CREATE INDEX idx_work_item_project_status ON work_item(project_id, status);
CREATE INDEX idx_person_skill_skill_id ON person_skill(skill_id);
CREATE INDEX idx_planning_snapshot_inputs_hash ON planning_snapshot(inputs_hash);
