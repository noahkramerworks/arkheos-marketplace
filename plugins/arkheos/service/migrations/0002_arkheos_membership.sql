PRAGMA foreign_keys = ON;

ALTER TABLE customers ADD COLUMN account_subject TEXT;
ALTER TABLE customers ADD COLUMN verified_at TEXT;

ALTER TABLE subscriptions ADD COLUMN plan TEXT;
ALTER TABLE subscriptions ADD COLUMN paid_through TEXT;
ALTER TABLE subscriptions ADD COLUMN grace_through TEXT;
ALTER TABLE subscriptions ADD COLUMN canceled_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_account_subject_idx ON customers(account_subject);

CREATE TABLE IF NOT EXISTS account_trials (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id),
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);

CREATE TABLE IF NOT EXISTS checkout_requests (
  idempotency_key TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plan TEXT NOT NULL,
  stripe_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_requests (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  stripe_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_products (
  product_id TEXT PRIMARY KEY,
  current_version TEXT NOT NULL,
  channel TEXT NOT NULL,
  catalog_revision TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_releases (
  product_id TEXT NOT NULL,
  version TEXT NOT NULL,
  channel TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (product_id, version)
);

CREATE TABLE IF NOT EXISTS artifacts (
  sha256 TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  length INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
