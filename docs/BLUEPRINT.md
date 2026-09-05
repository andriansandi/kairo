# KAIRO — Engineering Delivery & Resource Intelligence

**Technical & Product Blueprint v1.0** — internal VML engineering tool.
Status: foundation document for implementation. No implementation code herein.

---

## 1. OBJECTIVE

### Primary objective

KAIRO is a **deterministic planning and decision-support layer** that sits on top of Plane.so and management's project timelines. It computes — never guesses — capacity, utilization, conflicts, skill match, and timeline feasibility from real data, and uses AI **only** to explain, recommend, and answer questions about those verified computations.

The core product insight: **the gap between the *declared plan* (what management's XLS says) and the *computed plan* (what the resources can actually deliver) is the most valuable thing KAIRO produces.** Every feature should sharpen that gap or explain it.

### Problems being solved

| # | Problem today | KAIRO's answer |
|---|---|---|
| 1 | People are allocated across multiple Builder projects + shared DevOps; nobody has a single consolidated view | One capacity ledger, weekly granularity, working-day based |
| 2 | Over-commitment is discovered late (burnout, missed deadlines) | Conflict engine evaluates every allocation change against capacity |
| 3 | DevOps is a shared bottleneck but contention is invisible until it bites | Cross-project DevOps demand vs. supply, computed per week |
| 4 | Staffing decisions are made from memory ("who knows Drupal?") | Skill matrix with proficiency + JR matching engine with explainable scores |
| 5 | Timelines are declared in XLS without checking capacity | Feasibility engine: declared vs. computed finish, with buffer analysis |
| 6 | "Why is this late?" has no traceable answer | Every number drillable to source; every conflict explained with its own data |
| 7 | What-if questions ("move it one week?") take a day of spreadsheet work | Scenario engine: mutate, recompute deterministically, diff in seconds |

### Target users

- **Primary:** Technology leadership (CTO, Head of Delivery, Engineering Managers) — portfolio decisions.
- **Secondary:** Tech leads / delivery managers — staffing a project, checking a JR match. DevOps lead — shared-capacity planning.
- **Not users (MVP):** individual developers doing daily work — they stay in Plane. KAIRO is read-mostly for them (maybe a "my utilization" view, Later).

### Key outcomes

1. Any of the eleven core questions (feasibility, best match, overload, competing projects, skill gaps, at-risk projects, +1 week impact, earliest delivery, why risky, alternatives, defensible rationale) answerable in **< 5 minutes with traceable numbers**.
2. Every AI explanation is **backed by and cites deterministic KAIRO data** — defensible in front of a client or leadership.
3. Planning decisions leave an **audit trail** (which snapshot, which data, which recommendation).
4. Over-allocation is caught **before commitment**, not after.

### What KAIRO is NOT

- Not a project management system — Plane owns work, status, and execution. KAIRO never duplicates that.
- Not a time-tracking or actuals system.
- Not an HR system (no leave workflows, no salaries, no performance).
- Not a financial tool (no rates/cost/margin — Later at most).
- Not autonomous: **AI recommends, humans decide.** Nothing is auto-applied.
- Not a generic "AI platform" — AI is a garnish on deterministic engines, never a dependency for correctness.

---

## 2. PRODUCT SCOPE

### Must Have (MVP = Phases 0–5)

1. **Plane sync** (read-only): projects, issues/JRs, assignees, status, priority, dates, estimates, cycles, labels, dependencies-where-available. Cron-driven incremental + nightly full reconciliation. Person mapping by email with a review queue.
2. **XLS timeline import**: template-based, column-mapping UI, row-level validation report, **propose→confirm** (never auto-commit). Originals stored in R2.
3. **People / teams / roles / skills CRUD** with proficiency levels (Novice/Intermediate/Advanced/Expert).
4. **Allocations**: person × project (or phase) × FTE × date range. Person-level only — team views are aggregations, never primary data.
5. **Capacity ledger & views**: per-person per-week gross/PTO/overhead/available/planned/utilization, in hours and working days. Team rollups (Builder A, B, DevOps). Project demand view.
6. **Conflict engine**: person overload, team over-demand, DevOps contention, deadline breach, dependency violation, skill bottleneck, SPOF, buffer erosion, unstaffed phase. Severity levels with deterministic, templated explanations.
7. **JR skill requirements**: manual entry + AI extraction with **human confirmation** (unconfirmed AI output never feeds engines).
8. **Matching engine**: JR → ranked people with per-component score breakdown.
9. **Feasibility engine**: declared vs. computed timeline, slack, verdict, and at least one generated alternative (deadline extension and/or resource leveling).
10. **AI Advisor (grounded)**: explanations of conflicts/feasibility, recommendations, natural-language Q&A over verified data — with output validation and template fallback.
11. **Dashboard**: portfolio health, top conflicts, capacity heat strip.
12. **Auth via Cloudflare Access** (zero-code), identity→person mapping, admin/planner/viewer roles.

### Should Have (shortly after MVP)

- AI skill extraction from JR descriptions (needs the confirmation UX above first).
- Scenario ops beyond move/deadline (add/remove resource, change FTE, defer JRs) — the engine supports them from day one; UX ships incrementally.
- DevOps contention trend + SPOF report on the Skills page.
- In-browser scenario preview (engines run client-side on the current snapshot for instant feedback; server recomputes authoritative results).
- Staleness indicators (XLS older than N weeks, sync failures surfaced).

### Later

- Write-back to Plane (e.g., set assignee from a match recommendation) — only after trust is established.
- Historical trends & forecast accuracy (snapshot retention over months).
- Portfolio-level optimizer (true resource-constrained scheduling, not greedy heuristics).
- Notifications/summaries (weekly digest), country-specific holiday calendars, per-person calendars.
- Export to XLSX/PDF, Slack integration, multi-workspace support.

### Explicitly Out of Scope

- Time tracking / actuals ingestion.
- Cost, rates, billing, margins.
- Leave request workflow (KAIRO stores PTO days as capacity facts, nothing more).
- Chat/realtime collaboration, mobile app.
- Custom auth/login system (Cloudflare Access only).
- Daily-granularity allocation planning (weekly buckets are the planning truth; daily is false precision).
- Automatic re-planning / auto-assignment (recommendations only).

---

## 3. CORE USER FLOWS

**A. Plane synchronization** (system + admin)
1. Cron (every 15–30 min) calls Plane API incrementally (`updated_since` cursor per endpoint); nightly full sweep reconciles deletes/renames.
2. Writes land in staging tables + a `sync_run` audit row (counts, errors, cursor).
3. New Plane members auto-match KAIRO persons by email; unmatched → **mapping queue** in Settings. Unmatched assignees never silently create people.
4. Estimates (points/T-shirt) normalized via per-project conversion map (e.g., S=4h…XL=32h), overridable per JR; unestimated JRs flagged, excluded from effort math with a visible coverage %.
5. Successful sync marks the current snapshot stale → next read triggers rebuild.

**B. XLS timeline import** (planner)
1. Upload XLS(X) in browser → **parsed client-side** (SheetJS/exceljs) → normalized JSON preview → POST to API.
2. Server re-validates against the import schema (same isomorphic package), stores the file in R2, returns a draft import with a **row-level validation report** (errors, warnings, unmapped columns).
3. Planner maps columns → fields, maps rows → existing Plane projects (fuzzy match on name/code, human confirms), reviews proposed phases/milestones/allocations.
4. Confirm → phases, declared dates, and *proposed allocations* are committed; proposed allocations enter as `status: proposed` until the planner finalizes. Never auto-overwrite a confirmed mapping.
5. Import is versioned; a re-import supersedes on explicit confirmation only.

**C. Team/member management** (admin)
CRUD person (role, seniority, hours/day, overhead %, team memberships — a person can be in Builder A *and* tagged for DevOps work), teams (builder/devops), PTO entries. Key rule: **allocations attach to people, never to teams** — team capacity is always derived.

**D. Skill management** (admin/tech lead)
Skill taxonomy (name, category, aliases for "JS"/"JavaScript"), person skills with level 1–4 + verification source. Skills coverage matrix (skill × team) exposes gaps and single points of failure.

**E. JR skill extraction** (planner/tech lead)
1. Open JR → "Extract skills" (AI) → model returns skill requirements with min level + must/nice weight + confidence, grounded only in JR title/description + the skill taxonomy (closed vocabulary — it can only pick existing skill IDs).
2. Planner reviews, edits, **confirms** → stored as `jr_skill_requirement` (source: manual or ai-confirmed). Unconfirmed AI output never feeds matching.

**F. Resource matching** (tech lead)
Open JR (or "staff this phase") → matching engine scores all active people (hard gates: must-have skills, active status; then weighted score) → ranked list with per-component breakdown, availability in the JR window, and gaps. Optional "Ask KAIRO" for a narrative. The recommendation is advisory — applying it means creating an allocation manually.

**G. Capacity analysis** (leadership)
Capacity page: person/team/project pivots, weekly buckets, month/quarter rollups, working-day display, drill-down to the ledger math (gross − PTO − overhead = available; planned; utilization). "Show the math" everywhere.

**H. Conflict detection** (system)
Runs on every snapshot rebuild. Rules C1–C10 (§8) produce deduplicated conflict records with severity, window, affected entities, metrics, and a deterministic template explanation. Conflicts land in the inbox with lifecycle open → acknowledged → resolved (auto-closed if the rule no longer fires on the next snapshot; history retained).

**I. Timeline feasibility analysis** (planner)
Open project → Feasibility tab: forward-pass computed schedule vs. declared/deadline, slack, buffer %, critical path, resource-load histogram. Verdict: Healthy / Warning / At Risk / Critical with the exact reasons. "Generate alternatives" → deterministic candidate plans (§9), each with trade-off numbers; optionally an AI narrative comparing them.

**J. What-if simulation** (leadership)
Create scenario from current snapshot → apply typed mutation ops (move ±N weeks, add/remove allocation, change FTE, defer JRs, change deadline) → deterministic recompute → **diff report** (capacity, conflicts, feasibility deltas) → optionally AI explanation → save/share scenario. Scenarios never touch the live snapshot.

**K. AI explanation/recommendation** (any user)
From any conflict/feasibility/match/scenario: "Explain this" / "Recommend alternatives" → worker builds a **fact pack** from the snapshot → AI Gateway → LLM → **validation pipeline** (schema, citation, numeric checks) → stored `analysis` record pinned to the snapshot, rendered with the facts it cites. Failed validation → one retry → degrade to the deterministic template explanation (which always exists).

---

## 4. PRODUCT MODULES

Challenge to the proposed structure: **Timeline is not a top-level module** — a timeline is a property of a project; it belongs as the project detail's core tab. **Skills stays top-level** because skill coverage is a strategic, cross-project view, not a per-person attribute page. **AI Advisor is not a chat-first page** — it's (a) contextual "Explain/Recommend" actions on every object, plus (b) one central Q&A + analysis-history page.

| Module | Purpose | Key components |
|---|---|---|
| **Dashboard** | Portfolio health at a glance | Projects by health verdict, top 5 conflicts by severity, team capacity heat strip (this/next 4 weeks), sync & data-staleness status |
| **Projects** | Per-project truth | Tabs: Overview (status, deadline, priority, health), **Timeline** (declared vs. computed, phases, milestones), Phases & allocations, Work items (JR list), Feasibility, Conflicts |
| **Work / JRs** | Plane work, enriched | Filterable list; JR detail: skill requirements (manual + AI-confirm), matches, estimates, dates; links back to Plane (always) |
| **People** | The resource truth | List with utilization; person detail: profile, skills radar, allocations, weekly capacity ledger, "show the math" |
| **Skills** | Strategic coverage | Coverage matrix (skill × team/person), gap list, SPOF report, proficiency distribution |
| **Capacity** | Supply vs. demand | Weekly grid (people × weeks), team rollups, project demand, heat map, drill-downs |
| **Conflicts** | The inbox | Severity-grouped list, rule filters, conflict detail with deterministic explanation + "Ask KAIRO to explain", acknowledge/resolve |
| **Scenarios** | What-if lab | Scenario list, builder (typed ops), diff view (capacity/conflicts/feasibility deltas), saved comparisons |
| **AI Advisor** | Central Q&A | Natural-language question box (routed to deterministic intent first, AI second), analysis history with cited facts |
| **Settings** | Admin | Plane connection & sync runs, import templates & mapping queue, teams, org calendar & holidays, engine weights/thresholds, AI model config, roles |

---

## 5. DATA MODEL

Four strata. The rule that matters most: **the Planning Snapshot**. All derived data is keyed to an immutable snapshot (inputs hash); scenarios are snapshots; AI analyses are pinned to snapshots. This gives reproducibility, auditability, and cheap what-ifs.

### SOURCE — EXTERNAL (synced, read-only in KAIRO)

| Entity | Key fields | Notes |
|---|---|---|
| `sync_run` | source, type (incremental/full), cursor, status, stats, errors, started/finished | Audit trail of every Plane/import touch |
| `project` | plane_id, code, name, status, priority (KAIRO-managed — Plane has none), deadline, declared_start/end, team_scope | Merged identity: Plane project ↔ XLS project (confirmed mapping) |
| `work_item` (JR) | project_id, plane_id, title, status, priority, assignee ids, start/due, estimate (raw + normalized hours), cycle, labels, updated_at | JR == Plane issue. Raw estimate preserved; normalization is derived |
| `phase` | project_id, name, sequence, declared_start/end, effort_hours, status, source (xls/manual) | From XLS confirm or manual |
| `timeline_import` | R2 key, mapping, row report, status (draft/confirmed/rejected), uploaded_by | The XLS provenance |
| `dependency` | from (project/phase), to (project/phase), type FS/SS/FF/SF, lag_days, source (plane/manual) | Plane relations where available; manual entry is the first-class fallback, not a hack |

### SOURCE — KAIRO-MANAGED (the people truth)

| Entity | Key fields |
|---|---|
| `person` | name, email, role_id, seniority, hours_per_day, overhead_pct (default 20), active |
| `team` | name, type (builder/devops/other) |
| `team_membership` | person_id, team_id (many-to-many; DevOps membership is a tag, not a cage) |
| `role` | name, seniority ladder |
| `skill` | name, category, aliases |
| `person_skill` | person_id, skill_id, level 1–4, verified_by, source |
| `allocation` | person_id, project_id, phase_id?, fte, start_date, end_date, status (committed/planned/proposed), source |
| `pto_entry` | person_id, dates, type |
| `org_calendar` | working days, holidays (single org calendar MVP) |
| `jr_skill_requirement` | work_item_id, skill_id, min_level, weight (must/nice), source (manual/ai-confirmed) |
| `scenario_def` | name, base_snapshot_id, ops (typed JSON), created_by, status |

### DERIVED (computed, keyed to snapshot_id — disposable, recomputable)

| Entity | Content |
|---|---|
| `planning_snapshot` | id, created_at, inputs_hash, trigger, notes |
| `capacity_entry` | person × week: gross_h, pto_h, overhead_h, available_h, planned_h, utilization, flags |
| `conflict` | rule_id, type, severity, entities, window, metrics, template explanation, status |
| `match_result` | work_item × person: score, component breakdown, gaps, computed_at, snapshot |
| `feasibility_result` | project: computed start/finish, slack_days, buffer_days, verdict, critical path, per-phase load |
| `scenario_diff` | scenario_id: capacity/conflict/feasibility deltas vs. base |

### AI-GENERATED (advisory, never authoritative, never engine input)

| Entity | Content |
|---|---|
| `analysis` | snapshot_id, kind (explain/recommend/compare/qa), subject, prompt digest, provider, model, output (structured + citations), validation_result, cited_fact_ids, superseded flag |
| `skill_extraction` (pre-confirmation) | work_item_id, proposed requirements, confidence — promoted to `jr_skill_requirement` only on human confirm |

**Relationships (essentials):** project 1—N phase, project 1—N work_item; person N—M team; person N—M skill (with level); person 1—N allocation N—1 project/phase; dependency: project/phase → project/phase; everything derived references snapshot_id; analysis references snapshot_id + subject.

**Snapshot lifecycle:** any source write marks current snapshot stale → next read rebuilds (lazy, locked) → new snapshot id, inputs_hash, derived tables repopulated; retain last ~10 snapshots (configurable) for audit and diffing. Scenarios fork a snapshot with mutation ops applied.

---

## 6. CAPACITY MODEL

**Unit of account: hours, displayed as working days** (default 8h/day). **Granularity: the ISO week.** Daily is false precision for planning; monthly hides deadline collisions. All math is calendar-aware (working days, org holidays, per-person PTO).

### Definitions (individual, per week)

| Term | Formula | Example (Dana, 40h week, 1 day PTO, 20% overhead) |
|---|---|---|
| **Gross capacity** | working_days × hours_per_day | 5 × 8 = 40h |
| **Available capacity** | gross − pto_h − overhead_h, where overhead_h = gross × overhead_pct | 40 − 8 − 8 = **24h (3.0 days)** |
| **Planned capacity** | Σ allocation fte × gross (allocations are FTE **of gross**) | Alpha 50% + Beta 50% = 40h |
| **Utilization** | planned ÷ available | 40 ÷ 24 = **167%** |
| **Over-capacity** | planned − available (hours and day-equivalents) | 16h ≈ **2.0 working days short** |
| **Personal buffer** | available − planned | −16h (none; over-committed) |

**Deliberate design choice:** allocation FTE is a share of *gross* time (that's what "Dana is 50% on Alpha" means to management), while utilization is measured against *available*. Consequence: a person "100% allocated" shows ~125% utilization when overhead is 20% — which is the truth, and it makes over-commitment visible instead of hidden. This must be displayed with the math, or it will confuse people once.

### Team capacity (Builder A/B, DevOps)

Pure aggregation: `team_available(week) = Σ member available_h`; `team_demand(week) = Σ allocations of members (any project)`; utilization = demand ÷ available. No team-level "extra" overhead in MVP (additive only — simplicity over spurious accuracy). DevOps is not special in the math; it's special in the **rules**: its demand comes from multiple projects, so contention analysis (C3) treats it as a shared pool.

### Project capacity (demand side)

`project_demand(week) = Σ allocations to the project` (can exceed any team's supply — that's a conflict, not a bug). Feasibility uses demand vs. the *specific people's* available hours (a project staffed with people who are 140% utilized elsewhere is not feasible, even if the team aggregate looks fine — this is why allocations are person-level).

### Buffers — two distinct kinds (never conflate)

1. **Capacity buffer (person):** available − planned ≥ target slack (default 15% of available). Below → C9 warning; negative → over-capacity (C1).
2. **Schedule buffer (project):** working days between computed finish and deadline. Target: max(3, 15% of phase duration) working days. Erosion → C9.

### Worked example — the capacity ledger (Dana, 4 weeks)

| Week | Gross | PTO | Overhead | Available | Planned | Utilization | Flag |
|---|---|---|---|---|---|---|---|
| W36 | 40 | 0 | 8 | 32 | 24 (A 30%, B 30%) | 75% | healthy |
| W37 | 40 | 8 | 8 | 24 | 40 (A 50%, B 50%) | 167% | **over-capacity** |
| W38 | 40 | 0 | 8 | 32 | 40 (A 50%, B 50%) | 125% | **at risk** |
| W39 | 40 | 0 | 8 | 32 | 12 (A 15%, B 15%) | 38% | healthy |

---

## 7. RESOURCE MATCHING

Deterministic, explainable, weight-configurable (Settings). JR = the unit; phases can also be matched as "staffing requests" via the same engine.

### Proficiency scale

`1 Novice · 2 Intermediate · 3 Advanced · 4 Expert`. A requirement states a **minimum level** and a weight: **must** or **nice**.

### Algorithm

1. **Candidate set:** active persons. (Team is a soft factor, not a filter — Builder B people can and do work across.)
2. **Hard gates (default, toggleable for exploration):** every must-have skill met at min level; at least some free capacity in the JR window; not on planned leave for the whole window.
3. **Component scores (0–100 each):**
   - **Skill score:** per skill `s = 1 + 0.25 × min(actual − required, 1)` if met, `0` if nice-and-missing (must-and-missing → gated). Weighted mean with must = 2× weight of nice.
   - **Availability score:** `min(free_hours_in_window ÷ required_hours, 1) × 100`.
   - **Context score:** 100 if already allocated to the project (continuity, no switching cost); 50 if new but same team; 0–50 penalty if this would be their 3rd+ concurrent project.
   - **Role/seniority score:** role match (same role family 100, adjacent 60, none 30) × seniority within ±1 level of expectation.
4. **Composite:** `0.45 × skill + 0.35 × availability + 0.10 × context + 0.10 × role` (weights configurable; skill and availability always ≥ 70% of weight combined).
5. **Output per candidate:** composite + full component breakdown + free hours + existing commitments + skill gaps. Never a naked number.
6. **Gap alternatives:** if nobody clears the gates, list the nearest misses with their exact gaps ("Edo: Drupal 2 < required 3") and suggest pairing (expert + learner).

### Worked example

JR "Drupal 10 module upgrades", effort 80h, 2-week window, needs **Drupal 3 (must), PHP 2 (must), QA 1 (nice)**.

| | Dana (Sr. Fullstack, on project) | Edo (Mid Backend, free) |
|---|---|---|
| Skills | Drupal 4, PHP 3, QA — | Drupal 2, PHP 3 |
| Gates | Pass | **Fail** (Drupal 2 < 3) — shown as nearest-miss |
| Skill | (1.25×2 + 1×2 + 0×1) ÷ 5 = **90** | — |
| Availability | 30h free ÷ 80h = **38** | — |
| Context | **100** (continuity) | — |
| Role | **100** | — |
| **Composite** | 0.45×90 + 0.35×38 + 10 + 10 = **71.5** | flagged: needs Drupal upskilling or pairing |

The honest tension is the point: Dana is the skills match but only 38% available — the system surfaces "pair Dana 50% + upskill Edo" as the next analysis step rather than hiding it behind a single opaque score.

---

## 8. CONFLICT ENGINE

Deterministic rules over the snapshot's weekly buckets. Every rule has: ID, inputs, condition, severity thresholds, and a **template explanation with real numbers** (AI never generates the base explanation).

### Rules

| ID | Rule | Condition (weekly buckets) | Data cited in explanation |
|---|---|---|---|
| C1 | Person over-allocation | utilization > 100% | person, per-project FTE list, available vs. planned hours, shortfall in days |
| C2 | Team over-demand | team demand > team available | team, member-level breakdown, worst weeks |
| C3 | DevOps contention (shared pool) | DevOps team demand > available, driven by ≥2 distinct projects | per-project DevOps demand share, competing projects & their priorities |
| C4 | Deadline breach | computed finish > project deadline (or phase finish > milestone) | computed finish, deadline, overshoot days, critical path summary, driver (capacity vs. dependency) |
| C5 | Project resource overlap | same person(s) substantially allocated to overlapping phases of different projects without a declared dependency | people, projects, overlap window, combined FTE |
| C6 | Dependency violation | successor starts before predecessor finish (+ lag) | both ends, the violated edge, source (plane/manual) |
| C7 | Skill bottleneck | JR/project requires skill S at level L: (qualified people × free hours) < required hours in window | skill, qualified count, free vs. required hours, nearest-miss candidates |
| C8 | Single point of failure | exactly 1 person has skill S at level L (org-wide) and is allocated >50% across ≥2 concurrent projects | the person, the skill, every dependent project |
| C9 | Buffer erosion | schedule slack < buffer target, or person slack < 15% of available | slack vs. target, which weeks eat it |
| C10 | Unstaffed critical phase | phase inside horizon has no (or < required) allocation | phase, dates, required vs. staffed FTE |

### Severity

| Severity | Meaning | Typical thresholds |
|---|---|---|
| **Healthy** | No rule fires | — |
| **Warning** | Buffered risk — no breach yet, but buffer is thin | person util 85–100%; slack 0 < slack < buffer target; C10 on non-critical phase |
| **At Risk** | Breach predicted if nothing changes | person util 100–125% for 1–2 weeks; computed finish ≤ deadline + 10 wd; C7 with a viable second-best candidate |
| **Critical** | Certain breach or burnout | person util > 125%, or any >100% sustained ≥ 2 weeks; computed finish > deadline + 10 wd; C6 hard violation; C8 with the SPOF > 75% allocated |

Escalation rule: base severity from the metric, +1 level if sustained ≥ 2 consecutive weeks. All thresholds configurable in Settings.

### Example deterministic explanation (C1, template-filled)

> **C1 — Dana is allocated 167% in weeks Sep 8–Sep 19.** Planned: Alpha 50% + Beta 50% of gross (40h/wk). Available: 24h–32h/wk after PTO (8h, W37) and 20% overhead. Shortfall: 16h ≈ 2.0 working days in W37. Driver: Beta allocation starts one week before Alpha ends.

Conflicts: deduplicated by (rule, entities, window-coalescing); lifecycle open → acknowledged → resolved; auto-closed with history when the rule stops firing on a newer snapshot.

---

## 9. TIMELINE PLANNING ENGINE

### Feasibility (is the declared timeline achievable?)

1. **Build the activity network:** phases as nodes (effort in hours from normalized JR estimates or XLS), dependency edges (default finish-to-start). Declared dates are *intent*, not truth.
2. **Staffing plan:** allocations per phase (person × FTE × window).
3. **Constrained forward pass, week by week:** phase duration = `ceil(effort ÷ Σ(staffed FTE × available hours/week))` working weeks, honor calendar, start = max(predecessor finishes, declared earliest start). Track per-person load; where people are shared across concurrent phases, their throughput is split by FTE.
4. **Computed finish vs. deadline:** slack_days = deadline − computed finish (working days). Verdict:
   - slack ≥ buffer target → **Healthy**
   - 0 ≤ slack < target → **Warning** (feasible, no buffer)
   - finish > deadline but ≤ +10 wd, or feasible only with a C1/C2 on the path → **At Risk**
   - > +10 wd, or C6, or phase mathematically unschedulable → **Critical**
5. **Skill-fit overlay:** if staffed people don't meet the phase's must-have skills, downgrade verdict one level and fire C7 (feasibility math is capacity-based; skill mismatch is a flagged risk, not silently baked into throughput — that keeps the math honest and debuggable).

**MVP honesty note:** this is a greedy, priority-ordered heuristic (deadline proximity, then project priority, then least-disruption), not an optimal scheduler. RCPSP optimization is Phase 7. For an internal planning tool with dozens of people, greedy + transparent explanations beats a black-box optimizer nobody trusts.

### Alternative timeline generation (when infeasible)

Strategies evaluated in order — the ordering *is* the objective function (deadline first, minimum disruption last; committed projects are frozen, `planned/proposed` are elastic):

1. **Level resources within free capacity:** raise FTE of underutilized *qualified* people already on the project (cheapest — no context switch).
2. **Borrow qualified, available people** from non-committed work.
3. **Resequence** non-dependent phases into the slack of others (parallelize where the network allows).
4. **Extend the deadline minimally:** the exact number of working weeks needed to restore the buffer target — presented as fact ("+3 working weeks restores a 15% buffer").
5. **Reduce scope:** deterministic ranking of deferrable JRs (low priority, non-blocking on the critical path) with the hours each deferral recovers.

Each alternative ships with trade-off numbers (finish date, utilization deltas, conflicts created/resolved, disruption to committed allocations). Management sees options with consequences — KAIRO does not pick for them.

---

## 10. AI ARCHITECTURE

### Boundary (hard rule)

| Deterministic — NEVER an LLM | AI — always grounded |
|---|---|
| Capacity, utilization, working days | Understanding JR descriptions → skill extraction (closed vocabulary, human-confirmed) |
| Overlap & conflict detection | Explaining conflicts (on top of template explanations) |
| Skill matching scores | Explaining project risk |
| Deadline & feasibility math | Recommending alternatives (comparing deterministic options) |
| Dependency validation | Comparing scenarios (narrating deterministic diffs) |
| All of §6–§9 | Management-friendly argumentation; NL Q&A over verified data |

Enforcement, not convention: engines live in packages with **zero AI imports**; AI layer imports engines, never the reverse. The AI service is optional at runtime — if AI Gateway or the provider is down, every screen still works with deterministic explanations.

### Context structure — the Fact Pack

Every AI call receives only: (1) role & hard rules, (2) a typed, ID-addressed fact set built from the snapshot, (3) the task. Facts are **pre-computed** — including the derived numbers the answer may legitimately use (utilization sums, slack, alternatives with their finish dates). The server knows every legal number *before* the model answers.

```json
{
  "snapshot": "s_812", "generated": "2026-09-05T08:00:00Z",
  "facts": [
    {"id": "P:12", "type": "project", "name": "Client X Redesign", "deadline": "2026-11-30", "priority": 1},
    {"id": "PH:41", "type": "phase", "project": "P:12", "effort_h": 320, "declared": ["2026-10-01", "2026-10-31"]},
    {"id": "A:301", "type": "allocation", "person": "PE:dana", "phase": "PH:41", "fte": 0.5},
    {"id": "F:9", "type": "feasibility", "project": "P:12", "computed_finish": "2026-11-19", "slack_days": 7, "buffer_target_days": 6, "verdict": "warning"},
    {"id": "C:77", "type": "conflict", "rule": "C1", "severity": "at_risk", "person": "PE:dana", "utilization": 1.25, "weeks": ["2026-10-13", "2026-10-20"]}
  ]
}
```

System prompt contract: *You may only state facts present above, cited by id. You may not introduce dates, names, capacities, or allocations not in the fact set. Arithmetic on cited facts is allowed if shown. If the data doesn't support an answer, say so.*

### Anti-hallucination pipeline (defense in depth)

1. **Closed inputs:** fact pack contains everything the model may know. No raw DB dumps, no prompt-injection surface from JR text beyond the extraction use case (which uses a closed skill vocabulary).
2. **Structured output required** (JSON schema): claims[] with `{claim, fact_ids[], value}`.
3. **Citation check:** every claim must cite existing fact ids.
4. **Numeric check:** every numeric/date in the output must appear verbatim in the fact pack or in the server-precomputed allowlist of derived values (the server already computed utilization sums, alternatives, diffs — anything else is invention).
5. **One retry** with the validation errors; then **degrade to the deterministic template explanation** — which always exists. The user sees "AI explanation unavailable — showing verified data summary", never an unvalidated paragraph.
6. **Storage & staleness:** analyses store snapshot_id, cited fact ids, model, validation result; flagged stale when a newer snapshot exists ("this explanation reflects data as of Sep 5").
7. **Anonymization option (Settings):** send person names or PE:p1/PE:p2 placeholders to third-party providers; KAIRO re-hydrates names on render. Default off for internal LLM endpoints, recommended on for external ones.

AI access is exclusively via **Cloudflare AI Gateway** (one egress point, caching, logging, per-env credentials). Provider + model configurable in Settings (DB) with env-var fallback — never hard-coded.

---

## 11. WHAT-IF SIMULATION

**Scenario = base snapshot + ordered list of typed mutation ops.** Ops are stored (replayable), not just results — engines can improve and scenarios recompute consistently. Everything before AI: **calculate the impact deterministically, then optionally narrate.**

| Op | Semantics |
|---|---|
| `move_project{weeks: ±N}` | shift all phases, declared dates, allocations, deadline-anchored JRs by N weeks (calendar-aware) |
| `set_deadline{date}` | change project deadline |
| `add_allocation` / `remove_allocation` / `change_fte` | person × project/phase FTE changes ("add/remove a resource" are allocation ops — no separate concept) |
| `defer_work_items{ids[]}` | exclude JRs from effort/feasibility (scope reduction); show recovered hours |
| `add_person_skill{person, skill, level}` | model a hire/upskill (planning hypothesis) |

**Flow:** create scenario → pick ops (or use quick presets: "+1 week", "−1 week", "remove DevOps from this project") → recompute → **diff report**: per-person/per-team utilization deltas, conflicts created/resolved by severity, feasibility verdict changes, project finish-date movements → "Explain this diff" (AI, validated) → save/compare scenarios side by side. Scenarios are read-only against live data — merging a scenario into reality is an explicit human act (apply its allocations as `proposed`).

---

## 12. ROADMAP

Phases are value-ordered; each is deployable and demoable. **MVP boundary: end of Phase 5.** Durations are engineer-weeks for ~2 contributors.

**Phase 0 — Foundation** (1–2 w)
- *Objective:* deployable skeleton, path-to-prod proven.
- *Features:* health page behind Cloudflare Access; empty shell app.
- *Technical:* monorepo (pnpm), worker + Hono + static assets, D1 + migrations, CI (typecheck/test/deploy to staging), R2 bucket, AI Gateway route, envs (dev/staging/prod).
- *Dependencies:* Cloudflare account, Plane workspace + API key, domain/Access setup.
- *Exit:* `wrangler deploy` from CI; authenticated healthz in prod; DB migration pipeline works.

**Phase 1 — Data Ingestion** (3 w)
- *Objective:* all source data flows into one schema; people truth exists.
- *Features:* Plane sync (projects, JRs, members, estimates, labels; dependencies where available) + sync-run UI + person mapping queue; people/teams/roles/skills CRUD; PTO entries; XLS import (parse in browser, validate, map, confirm); snapshot builder v1 (inputs hash only).
- *Technical:* plane-client (pagination, rate-limit backoff), xls-import package (isomorphic), R2 storage, cron triggers.
- *Dependencies:* Phase 0; agreed XLS template; estimate conversion policy.
- *Exit:* a full real XLS + Plane sync produces a consistent snapshot; zero unmatched projects; import errors are row-level actionable.

**Phase 2 — Capacity & Timeline** (3 w)
- *Objective:* the number leadership trusts.
- *Features:* capacity ledger + views (person/team/project pivots, weekly grid, heat strip), allocation CRUD, phase timelines, working-day math, "show the math" drill-downs; rules C1, C2, C4, C10 + conflict inbox.
- *Technical:* calendar package, capacity-engine, first half of conflict-engine.
- *Dependencies:* Phase 1 data live.
- *Exit:* capacity view reconciles exactly with a manual spreadsheet check on 3 pilot projects (the adoption gate).

**Phase 3 — Skill Intelligence** (2–3 w)
- *Objective:* staffing by evidence.
- *Features:* skill proficiency model + coverage matrix + SPOF report (C8); JR skill requirements (manual first); matching engine + matches UI with breakdowns.
- *Technical:* matching-engine; jr_skill_requirement schema; AI Gateway plumbing (for Phase 3.5 extraction).
- *Dependencies:* Phase 2; skill taxonomy workshop (one-time, real, necessary — this is org work, not code).
- *Exit:* 10 real JRs matched; tech leads accept top-3 lists as plausible; gaps explained.

**Phase 4 — Conflict Intelligence** (2 w)
- *Objective:* the full early-warning system.
- *Features:* remaining rules C3 (DevOps contention), C5, C6, C7, C9; severity config; conflict lifecycle; dashboard portfolio view.
- *Technical:* conflict-engine completion; dedup/window coalescing; templates for all rules.
- *Dependencies:* Phases 2–3.
- *Exit:* weekly conflict review runs on real data; every conflict renders a correct deterministic explanation with real numbers.

**Phase 5 — Feasibility & AI Advisor** (3 w)
- *Objective:* "is this timeline achievable — and why" answered defensibly.
- *Features:* feasibility engine (declared vs. computed, verdicts, critical path); alternative generation (strategies 1–5); AI explanations/recommendations with the full validation pipeline; NL Q&A with deterministic-first intent routing; **MVP exit**.
- *Technical:* planning-engine; ai package (fact pack, validator, degrade path); analyses storage.
- *Dependencies:* Phases 1–4.
- *Exit:* 0 invented facts across 50 sampled AI answers (human-audited); every verdict drillable to source data.

**Phase 6 — Scenario Simulation** (2–3 w)
- *Objective:* what-if in the room, not overnight.
- *Features:* scenario builder with typed ops + presets, deterministic diffs, side-by-side compare, AI narrative on diffs; in-browser preview of scenarios.
- *Technical:* scenario snapshot fork/recompute; diff computation; engines bundled to browser (they're pure — verify bundle hygiene).
- *Dependencies:* Phase 5.
- *Exit:* "+1 week" answered in < 10 seconds end-to-end, in a live meeting.

**Phase 7 — Advanced Planning** (ongoing)
- Portfolio optimizer (RCPSP heuristics → better), trend history & forecast accuracy, notifications/digest, Plane write-back (guarded), country calendars, exports, optional Slack surface.

---

## 13. TECHNOLOGY ARCHITECTURE

```
                    ┌────────────────────────────────────────────────┐
                    │                Cloudflare Edge                  │
                    │                                                 │
 Browser ──────────►  Worker (Hono)                                  │
  React/Vite/TS     │   ├─ /api/*  ── deterministic endpoints       │
  TanStack Router   │   ├─ /api/v1/analyses, /ask ── AI Gateway ────┼──► LLM provider (configurable)
  TanStack Query    │   ├─ static assets (Workers Assets)            │
  Tailwind          │   ├─ scheduled (cron): Plane sync, rebuilds    │
  XLS parsed here   │   └─ snapshot builder → derived tables         │
        │           │        │              │                       │
        └─ uploads──►       D1 (kairo)     R2 (imports/exports)      │
                    │        ▲              │                       │
                    └────────┼──────────────┼───────────────────────┘
                             │              │
                      Plane.so API ◄────────┘ (XLS originals retained)
```

**Components**

- **apps/web** — React + Vite + TS + Tailwind + TanStack Router/Query. XLS parsing happens here (SheetJS/exceljs in-browser), which keeps Worker CPU/request-size out of the parsing path; the same isomorphic `xls-import` package re-validates server-side. Charts: keep dependencies lean (e.g., a timeline/Gantt built on SVG + a small chart lib).
- **Worker (Hono)** — single deployable serving API + static assets (MVP; split only if forced). Routes as the only write path; engines invoked in-process; cron triggers for sync.
- **D1** — one DB per env. Internal scale (≈ tens of people, tens of projects, weekly buckets over 12–24 months ≈ low 10⁵s of capacity rows) is comfortably within D1.
- **R2** — XLS originals, later exports.
- **AI Gateway** — the only LLM egress: caching (identical fact packs), logs, per-env gateway IDs, provider/model from Settings with env fallback.
- **Plane API** — read-only, API-key auth, incremental via `updated_since`-style cursors with backoff; nightly full reconciliation for deletes.

**Data flow (write path):** source change (sync/import/CRUD) → D1 → snapshot marked stale → lazy rebuild on next read (locked; derived tables repopulated) → UI reads derived + source. **Read path** never computes heavy things inline — engines ran at snapshot build; ad-hoc queries (matching for one JR) run on demand against the current snapshot (cheap, deterministic, cacheable).

**Deterministic components (the non-negotiable list):** calendar math, capacity-engine, conflict-engine, matching-engine, planning-engine, snapshot builder, diff computation. All pure TypeScript packages with **no Workers/Node/browser-specific imports** — runnable in the Worker (authoritative), in tests (CI), and optionally in the browser (scenario preview). The `ai` package sits above them and is the *only* thing that talks to AI Gateway.

**Auth:** Cloudflare Access in front of the Worker (SSO, zero auth code in MVP). Worker middleware validates the Access JWT, maps identity → person by email, enforces admin/planner/viewer from DB. The boundary is one middleware — a real auth system can replace it later without touching handlers. *(2026-09-05 update, user-approved deviation: replaced the Access plan with simple username/password auth — `users` table, PBKDF2 hashes, HMAC-signed session cookie, `apps/worker/src/middleware/auth.ts` at the same middleware boundary. Cloudflare Access can still be layered in front later.)*

**Cloudflare limits & mitigations**

| Limit | Risk | Mitigation |
|---|---|---|
| Worker CPU time (30s paid) | Snapshot rebuild growth | Engines are O(people × weeks × projects) at internal scale (ms, not s); guard budget + escape hatch to Queues if ever needed |
| D1 single-writer, no heavy JOIN patterns | Contention | Small write volume (sync batches + CRUD); derived writes are batched inserts per snapshot |
| D1 10 GB / DB | Growth | Weekly buckets + retention of last ~10 snapshots; years of headroom internally |
| Subrequest limits | Sync pagination | Batched, cursor-based; sync is a scheduled invocation, not user-request |
| Request body size | XLS uploads | Parsing is client-side; only normalized JSON crosses the API |

**Security/privacy:** internal tool, but people data + client project data is sensitive — Access-gated, least-privilege API tokens (Plane read-only), secrets in Workers secrets store, R2 objects private (served via signed flow through the API), anonymization option for external LLM providers, full analysis audit log.

---

## 14. REPOSITORY STRUCTURE

pnpm workspace monorepo (Turborepo optional; pnpm alone suffices for MVP).

```
kairo/
├─ apps/
│  ├─ web/                    # React+Vite+Tailwind+TanStack Router/Query; XLS parsing, scenario preview
│  └─ worker/                 # Hono API, cron handlers, snapshot builder orchestration, migrations/
├─ packages/
│  ├─ types/                  # ALL domain types + zod schemas — single source of truth, no logic
│  ├─ calendar/               # working-day math, org calendar, PTO (pure)
│  ├─ capacity-engine/        # capacity ledger (pure) — depends: types, calendar
│  ├─ conflict-engine/        # rules C1–C10, severity, templates (pure) — depends: types, calendar
│  ├─ matching-engine/        # scoring (pure) — depends: types, calendar
│  ├─ planning-engine/        # feasibility, forward pass, alternatives (pure) — depends: types, calendar, capacity-engine
│  ├─ scenario/               # typed ops, snapshot fork/mutate, diff (pure) — depends: engines
│  ├─ ai/                     # fact pack builder, prompt contract, validator, AI Gateway client — depends: types
│  ├─ plane-client/           # typed Plane API client: pagination, backoff, normalization
│  └─ xls-import/             # template def, column mapping, row validation (isomorphic — browser + worker)
├─ tools/                     # migration scripts, seed fixtures, snapshot-bench
└─ pnpm-workspace.yaml
```

Rules: engines import **only** `types`/`calendar` (and capacity-engine for planning-engine) — enforced by lint boundaries; `worker` is the only package allowed to touch D1/R2/AI Gateway; nothing imports from `apps/*`; `types` imports nothing. This is what makes the deterministic/AI boundary physically real rather than aspirational.

---

## 15. API DESIGN

REST, `/api/v1`, JSON, cursor pagination (`?limit&cursor`), standard error shape `{error: {code, message, details?}}`. Everything except `/analyses`, `/ask`, `*/explain` is deterministic.

| Group | Endpoints |
|---|---|
| **Plane sync** | `POST /plane/sync` (admin, on-demand) · `GET /plane/sync-runs` · `GET /plane/sync-runs/:id` · `GET /plane/mapping-queue` · `POST /plane/mapping-queue/:id/resolve` |
| **Imports** | `POST /imports/timeline` (normalized JSON + R2 ref) · `GET /imports` · `GET /imports/:id` · `GET /imports/:id/rows?status=error` · `POST /imports/:id/confirm` · `DELETE /imports/:id` |
| **Projects** | `GET /projects` · `GET /projects/:id` (overview + declared & computed timeline + verdict) · `PATCH /projects/:id` (priority, deadline) · `GET /projects/:id/phases` · `POST/PATCH /phases/:id` · `GET /projects/:id/feasibility` · `POST /projects/:id/alternatives` |
| **Work items/JRs** | `GET /work-items?project&assignee&status&skill` · `GET /work-items/:id` · `PUT /work-items/:id/skill-requirements` · `POST /work-items/:id/extract-skills` (AI) · `GET /work-items/:id/matches?window` |
| **People** | `GET /people` · `POST/PATCH /people/:id` · `GET /people/:id/capacity?from&to` · `PUT /people/:id/skills` · `POST /people/:id/pto` |
| **Teams / Skills** | `GET /teams` · `GET /teams/:id/capacity?from&to` · `GET /skills` · `GET /skills/coverage` (matrix + SPOF) |
| **Allocations** | `POST /allocations` · `PATCH /allocations/:id` · `DELETE /allocations/:id` |
| **Dependencies** | `GET /dependencies?project` · `POST /dependencies` · `DELETE /dependencies/:id` |
| **Capacity** | `GET /capacity?from&to&group_by=week&team&person&project` |
| **Conflicts** | `GET /conflicts?severity&type&project&status` · `GET /conflicts/:id` · `POST /conflicts/:id/acknowledge` |
| **Snapshots** | `GET /snapshots/current` · `POST /snapshots/rebuild` (admin) |
| **Analysis (AI)** | `POST /analyses` `{kind, subjectType, subjectId, snapshotId?}` · `GET /analyses?subject` · `GET /analyses/:id` |
| **Scenarios** | `POST /scenarios` `{name, baseSnapshotId, ops[]}` · `GET /scenarios` · `GET /scenarios/:id/diff` · `POST /scenarios/:id/explain` (AI) |
| **Q&A** | `POST /ask` `{question}` — deterministic intent routing first, AI second, always answers with citations |
| **Meta** | `GET /healthz` · `GET /settings` · `PATCH /settings` (admin: weights, thresholds, model config) |

---

## 16. MVP SUCCESS CRITERIA

Inputs: Plane data + timeline XLS + team/resource data. Outputs, measurably:

1. **Capacity view:** for 3 pilot projects, KAIRO's person-week capacity math matches a manual spreadsheet reconciliation **exactly** (0 discrepancies after the overhead/PTO conventions are agreed). — *the trust gate.*
2. **Resource allocation:** every person's full allocation across all projects visible in one view; over-allocations flagged with hours/days and drivers.
3. **Skill matching:** top-3 matches for 10 real JRs judged plausible by tech leads; every score drillable to components; gaps stated as "skill X at level N missing".
4. **Conflict detection:** weekly, the conflict inbox surfaces the over-committed people and the DevOps contention weeks that leadership already knows about informally (recall on known issues ≥ 90% — if it misses known problems, the model is wrong) **plus** at least issues nobody had spotted (the value-add).
5. **Risk identification:** every project carries a feasibility verdict traceable to computed finish, slack, and driver conflicts.
6. **Explainable recommendations:** across a 50-answer audited sample, **0 fabricated facts** (all numbers traceable to snapshot data), and every AI explanation has its deterministic counterpart one click away.
7. **Adoption:** used in 2 real planning cycles; the eleven core questions answered live in meetings in < 5 minutes each.
8. **Freshness:** Plane data ≤ 30 min stale; snapshot rebuild < 5 s at current scale; sync failures visible on the dashboard within one cycle.

---

## 17. RISKS & ARCHITECTURAL CONCERNS

| Risk | Why it bites | Mitigation |
|---|---|---|
| **Plane API limitations** (dependencies sparse/absent, undocumented rate limits, estimate semantics vary) | Feasibility and dependency rules silently degrade | Manual dependencies are a first-class fallback, not a hack; normalization layer with per-project estimate conversion + per-JR override; conservative rate-limit backoff; nightly reconciliation; Phase 1 spike validates the real API surface before dependent work |
| **XLS inconsistency** (every plan formatted differently; dates as text; "50%" of what week?) | Garbage phases/allocations poison everything downstream | Strict template + column-mapping UI + row-level validation report; propose→confirm only; allocations must bind to explicit date ranges; import staleness indicators; never silently guess |
| **Allocation ambiguity** ("Dana on Alpha" — when? how much?) | The #1 modeling failure mode | Allocation = person × project/phase × FTE × explicit date range; weekly buckets; person-level only (team views derived) |
| **Incorrect estimates** (JR effort wrong) | Feasibility verdicts confidently wrong | Effort always visible + per-JR override; unestimated JRs excluded with coverage %; sensitivity: best/expected/worst effort → verdict range, not point (Phase 5 stretch; minimum: flag verdicts resting on < 80% estimated effort) |
| **Capacity model wrongness** (overhead % unrealistic, PTO missing) | Utilization numbers lose trust — fatal for this product | Configurable per-person overhead; visible math everywhere ("show me the 24h"); spreadsheet reconciliation gate (§16.1) before rollout; PTO entry must be *easier* than not doing it |
| **AI hallucination** | One invented number in a leadership deck kills the tool | Closed fact packs; precomputed numeric allowlist; citation + numeric validation; retry → deterministic template fallback; analyses pinned to snapshots; anonymization for external providers |
| **Dual-source drift** (XLS updated, KAIRO not re-imported) | Decisions made on stale declared timelines | Staleness badges on project/timeline (import age), dashboard reminder, sync status always visible |
| **Worker CPU / D1 limits** | Snapshot rebuild grows with people × horizon | Internal scale is tiny; budgets guarded; escape hatches (Queues/Workflows) identified but not built; snapshot retention policy |
| **Scaling beyond MVP** (multi-org, more teams) | Premature abstraction | Single-tenant, single-org by design; org boundary is one D1 DB + Access policy — future isolation without re-architecture |
| **Security/privacy** (people + client data; PII to LLMs) | Internal leak or vendor exposure | Access-gated everything; least-privilege Plane tokens; private R2 via API; anonymization toggle; analysis audit log |
| **Organizational adoption** | Nobody maintains skills/allocations → data rots → tool lies | Minimal admin overhead by design (skill confirm in seconds, allocation is the only recurring input); the tool must pay its way in the first planning cycle or be cut |
| **Scope creep into PM features** | Rebuilds Plane badly | Explicit out-of-scope list (§2); every work item deep-links to Plane; KAIRO never becomes the place work is managed |
| **Snapshot reproducibility across engine versions** | Old analyses unexplainable after engine changes | Analyses pinned to snapshot_id + inputs_hash; engines versioned; scenarios store ops, not results |

---

# FINAL RECOMMENDATIONS

## 1. Recommended MVP architecture

Single Cloudflare Worker (Hono) serving the React/Vite SPA and `/api/v1`; D1 for all data; R2 for XLS originals; AI Gateway as the sole LLM egress; Cloudflare Access for auth (zero-code, JWT-validated middleware, roles from DB). **The planning snapshot is the core abstraction**: all source writes → stale flag → lazy deterministic rebuild of derived tables (capacity ledger, conflicts, matches, feasibility) keyed by immutable snapshot; scenarios are forked snapshots with typed mutation ops; AI analyses are pinned to snapshots. Four pure-TS engine packages (capacity, conflict, matching, planning) with zero platform and zero AI imports, runnable in Worker, CI, and browser.

## 2. Recommended MVP feature list

1. Plane read-only sync (projects, JRs, members, estimates) + person mapping queue
2. XLS timeline import (browser-parsed, server-validated, propose→confirm)
3. People/teams/roles/skills with proficiency; allocations as FTE + date range
4. Weekly capacity ledger with team rollups and show-the-math drill-downs
5. Conflict rules C1, C2, C4, C10 at MVP; full set C3/C5–C9 by Phase 4
6. JR skill requirements (manual) + matching engine with component breakdowns
7. Feasibility: declared vs. computed timeline, verdict, one generated alternative
8. Grounded AI Advisor: conflict/feasibility explanations, recommendations, Q&A — validated, with deterministic fallback
9. Dashboard, conflict inbox, project/people/skills/capacity pages

## 3. Recommended technology stack

React 18 + Vite + TypeScript + Tailwind + TanStack Router + TanStack Query · Cloudflare Workers + Hono · D1 (SQLite) + wrangler migrations · R2 · AI Gateway (provider/model configurable via Settings/env) · SheetJS or exceljs (browser XLS parsing) · pnpm workspace monorepo · Vitest (engines are pure — test coverage is cheap and non-negotiable) · Cloudflare Access for auth.

## 4. Recommended roadmap

Phase 0 Foundation (1–2 w) → Phase 1 Data ingestion: Plane sync + XLS + people/skills (3 w) → Phase 2 Capacity & timeline + first conflicts (3 w) → Phase 3 Skill intelligence: matrix + matching (2–3 w) → Phase 4 Full conflict intelligence (2 w) → Phase 5 Feasibility + grounded AI advisor (3 w) **= MVP** → Phase 6 Scenario simulation & diffs (2–3 w) → Phase 7 Advanced planning (ongoing). The one deliberate change vs. the proposed structure: people/skills CRUD moves *into* Phase 1 (it's ingestion, not a feature phase), and conflict rules split across Phases 2 and 4 rather than waiting for one big-bang engine.

## 5. Top 10 architectural decisions

1. **Immutable planning snapshots** as the unifying abstraction — reproducibility, audit, and scenarios fall out of one concept.
2. **Deterministic-first**: every explanation/rule/verdict has a templated, data-filled, non-AI version; AI is optional garnish, never a dependency.
3. **Engines as pure, platform-agnostic packages** with lint-enforced boundaries — the deterministic/AI wall is physical, not aspirational.
4. **Capacity in working days/hours at weekly granularity**; allocations are FTE-of-gross with explicit date ranges; utilization measured against available (makes over-commitment visible by construction).
5. **Declared vs. computed timeline as the product's central comparison** — the XLS is intent, the engine is reality, the gap is the insight.
6. **Propose→confirm everywhere data enters**: XLS imports, AI skill extraction, Plane person mapping. Humans confirm; nothing auto-commits.
7. **AI validation pipeline**: closed fact packs + precomputed numeric allowlist + citation checks + retry → deterministic fallback; analyses pinned to snapshots.
8. **Person-level allocations only**; teams are aggregations — kills the classic "team X is on project Y" modeling bug and makes DevOps contention computable.
9. **Cloudflare Access instead of custom auth** — clean MVP boundary, one middleware to swap later.
10. **Store scenario ops, not results** — scenarios stay replayable and consistent as engines improve.

## 6. Top 10 things we should NOT build yet

1. Any write-back to Plane (read-only integration until trust is earned)
2. A full RCPSP/auto-scheduling optimizer (greedy heuristics + transparency win for MVP)
3. Custom authentication/accounts/sessions (Access covers it)
4. Cost, rates, or financial modeling
5. Time-tracking/actuals integration
6. Real-time collaboration (websockets, presence, multi-user editing)
7. Notifications/email/Slack infrastructure
8. Daily-granularity allocation planning
9. Multi-tenant/multi-workspace support
10. Anything autonomous for the AI (auto-assignment, auto-replanning, agent loops) — recommendations only, humans decide
