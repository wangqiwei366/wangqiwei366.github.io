CREATE TABLE IF NOT EXISTS user_moderation (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
