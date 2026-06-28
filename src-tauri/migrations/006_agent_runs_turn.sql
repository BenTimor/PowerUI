-- Adds the per-run loop turn counter to agent_runs. This is persisted each turn
-- (via onCheckpoint) so a stopped/finished run can be resumed with a correct
-- turn budget. (Migration 005 added messages_json but missed this column.)
ALTER TABLE agent_runs ADD COLUMN turn INTEGER NOT NULL DEFAULT 0;
