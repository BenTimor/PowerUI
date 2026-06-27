-- Folders added to a chat as working directories for agents.
CREATE TABLE IF NOT EXISTS chat_folders (
    id          TEXT PRIMARY KEY,
    chat_id     TEXT NOT NULL,
    path        TEXT NOT NULL,
    label       TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_folders_chat ON chat_folders(chat_id);

-- Tasks within a chat. Controllable by both the user and the manager agent.
CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    chat_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'todo', -- 'todo' | 'in_progress' | 'done' | 'cancelled'
    assignee_id     TEXT,                          -- sub_agent.id (nullable)
    created_by      TEXT NOT NULL DEFAULT 'user', -- 'user' | 'manager'
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Sub-agent definitions. Scoped per chat, not global.
CREATE TABLE IF NOT EXISTS sub_agents (
    id              TEXT PRIMARY KEY,
    chat_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    provider_id     TEXT,
    model_id        TEXT,
    system_prompt   TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_agents_chat ON sub_agents(chat_id);

-- A running (or finished) instance of a sub-agent working on a task.
-- Multiple rows per sub_agent_id are allowed (concurrent runs).
CREATE TABLE IF NOT EXISTS agent_runs (
    id              TEXT PRIMARY KEY,
    chat_id         TEXT NOT NULL,
    sub_agent_id    TEXT NOT NULL,
    task_id         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed' | 'cancelled'
    result          TEXT NOT NULL DEFAULT '',
    error           TEXT NOT NULL DEFAULT '',
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_agent_id) REFERENCES sub_agents(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_chat ON agent_runs(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

-- Events: messages/questions/answers exchanged between sub-agents and the
-- manager agent (and surfaced to the user).
CREATE TABLE IF NOT EXISTS agent_events (
    id              TEXT PRIMARY KEY,
    chat_id         TEXT NOT NULL,
    run_id          TEXT,                          -- originating agent_run (nullable for manager-originated)
    direction       TEXT NOT NULL,                 -- 'sub_to_manager' | 'manager_to_sub' | 'sub_to_user'
    kind            TEXT NOT NULL,                 -- 'message' | 'question' | 'answer' | 'task_complete' | 'started'
    content         TEXT NOT NULL DEFAULT '',
    pending         INTEGER NOT NULL DEFAULT 0,    -- 1 if awaiting a response (e.g. a blocking question)
    created_at      INTEGER NOT NULL,
    answered_at     INTEGER,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_events_chat ON agent_events(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_events_pending ON agent_events(pending);
