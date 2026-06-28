-- Add model preferences: starring and default selection
-- Starred models appear at the top of the ModelSelector dropdown.
-- Only one model globally can be the default (enforced at application level).
ALTER TABLE models ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE models ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_models_starred ON models(starred);
CREATE INDEX IF NOT EXISTS idx_models_default ON models(is_default);
