-- Full step-by-step trace of a sub-agent run (thoughts, tool calls, tool
-- results, assistant messages, and lifecycle markers like 'paused'/'resumed').
-- This is separate from agent_events, which tracks inter-agent MESSAGING
-- (questions/answers/messages between sub and manager). run_steps captures the
-- internal ReAct loop so it can be rendered in the sidebar trace view and
-- replayed when a run is woken (resumed).
CREATE TABLE IF NOT EXISTS run_steps (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL,
    -- 'thought' | 'tool_call' | 'tool_result' | 'assistant_text' |
    -- 'finished' | 'error' | 'paused' | 'resumed' | 'steered'
    kind            TEXT NOT NULL,
    text            TEXT,                 -- thought / assistant_text / error / marker note
    tool_name       TEXT,                 -- tool_call / tool_result
    tool_args       TEXT,                 -- tool_call (raw JSON arguments string)
    tool_result     TEXT,                 -- tool_result (truncated)
    turn            INTEGER NOT NULL DEFAULT 0, -- loop turn index when emitted
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id, created_at);

-- Persisted working message list for a run, so a stopped/finished run can be
-- RESUMED (woken) by replaying its conversation history. Stored as JSON.
ALTER TABLE agent_runs ADD COLUMN messages_json TEXT NOT NULL DEFAULT '[]';
