-- LocalPilot persistent memory schema.
-- All identifiers are UUID strings; timestamps are ISO-8601 UTC strings.
-- Every statement is idempotent (IF NOT EXISTS) so init_schema can run safely
-- on every startup.

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL,
    goal        TEXT NOT NULL,
    safety_mode TEXT NOT NULL,
    result      TEXT,
    error       TEXT
);

CREATE TABLE IF NOT EXISTS steps (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL,
    idx            INTEGER NOT NULL,
    thought        TEXT,
    tool           TEXT,
    arguments_json TEXT,
    result_json    TEXT,
    ok             INTEGER,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks (id)
);

CREATE TABLE IF NOT EXISTS errors (
    id         TEXT PRIMARY KEY,
    task_id    TEXT,
    step_id    TEXT,
    kind       TEXT NOT NULL,
    message    TEXT NOT NULL,
    traceback  TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks (id),
    FOREIGN KEY (step_id) REFERENCES steps (id)
);

CREATE TABLE IF NOT EXISTS preferences (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategies (
    id            TEXT PRIMARY KEY,
    pattern       TEXT NOT NULL,
    description   TEXT,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count    INTEGER NOT NULL DEFAULT 0,
    last_used_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_task_id ON steps (task_id);
CREATE INDEX IF NOT EXISTS idx_steps_task_idx ON steps (task_id, idx);
CREATE INDEX IF NOT EXISTS idx_errors_task_id ON errors (task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_strategies_pattern ON strategies (pattern);
