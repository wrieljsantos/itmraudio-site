CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  source TEXT NOT NULL DEFAULT 'coming-soon',
  consented_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'subscribed'
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
