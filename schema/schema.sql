-- Agent Workforce Analytics: core schema (DuckDB / Postgres-compatible)

-- HRIS: one row per agent version
CREATE TABLE agent (
  agent_id        TEXT PRIMARY KEY,
  parent_id       TEXT,                 -- delegation parent (span / layer)
  squad_id        TEXT,
  platoon_id      TEXT,
  role            TEXT,                 -- declared role
  model           TEXT,
  tier            TEXT,                 -- e.g. small / mid / large
  autonomy_level  INTEGER,              -- 0 tool-less ... 4 fully autonomous
  tools           TEXT[],               -- granted tools
  provider        TEXT,
  region          TEXT,
  is_external     BOOLEAN DEFAULT FALSE,
  lifecycle       TEXT,                 -- ephemeral | persistent
  build_type      TEXT,                 -- build | buy
  owner           TEXT,
  created_at      TIMESTAMP,
  retired_at      TIMESTAMP,
  retire_reason   TEXT
);

CREATE TABLE agent_version (
  agent_id     TEXT,
  version      TEXT,
  deployed_at  TIMESTAMP,
  build_cost_usd DOUBLE,                -- CAC: prompt work, evals, integrations
  eval_regressed BOOLEAN,
  recovered_at TIMESTAMP
);

-- One row per run: an epic, project, or session. All metrics can be scoped here.
CREATE TABLE run (
  run_id        TEXT PRIMARY KEY,
  title         TEXT,
  goal          TEXT,
  outcome_unit  TEXT DEFAULT 'accepted_deliverable',  -- configurable
  budget_usd    DOUBLE,
  started_at    TIMESTAMP,
  ended_at      TIMESTAMP,
  sei           DOUBLE,                 -- Swarm Efficiency Index, set at run end
  sei_version   TEXT,
  story_md      TEXT                    -- generated Run Story
);

-- One row per task (trace)
CREATE TABLE fact_task (
  run_id       TEXT,
  task_id      TEXT PRIMARY KEY,
  root_agent_id TEXT,
  task_type    TEXT,
  complexity   TEXT,
  started_at   TIMESTAMP,
  ended_at     TIMESTAMP,
  success      BOOLEAN,
  human_accept BOOLEAN,
  eval_score   DOUBLE,
  value_usd    DOUBLE
);

-- One row per LLM call or tool call (OTel GenAI span)
CREATE TABLE span (
  run_id         TEXT,
  span_id        TEXT PRIMARY KEY,
  task_id        TEXT,
  agent_id       TEXT,
  parent_span_id TEXT,
  kind           TEXT,                 -- llm | tool | external | orchestration | eval
  tool_name      TEXT,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  cache_hit      BOOLEAN,
  latency_ms     INTEGER,
  retry_count    INTEGER,
  error          TEXT,
  stall_ms       INTEGER,              -- rate limit / outage / quota wait
  activity_class TEXT,                 -- ktlo | innovation | coordination | rework
  cost_usd       DOUBLE,
  started_at     TIMESTAMP
);

-- Who delegated to or messaged whom (mayor graph)
CREATE TABLE edge (
  run_id     TEXT,
  from_agent TEXT,
  to_agent   TEXT,
  task_id    TEXT,
  kind       TEXT,                     -- delegate | message | review
  at         TIMESTAMP
);

CREATE TABLE price (
  model TEXT, effective_from DATE, in_per_mtok DOUBLE, out_per_mtok DOUBLE
);

CREATE TABLE survey_response (
  agent_id TEXT, task_id TEXT, submitted_at TIMESTAMP, payload JSON
);
