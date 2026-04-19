-- Hashed admin/customer API keys.
-- Bearer format: lk_<prefix>_<secret>
--   prefix : first 8 chars of key id (UNIQUE — cheap O(1) lookup)
--   secret : verified against hash via timing-safe compare
-- We never store the plaintext.  `hash` = sha256(secret + LIMEN_API_KEY_PEPPER).

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  prefix        TEXT NOT NULL,
  hash          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('viewer','admin','owner')),
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(prefix);
CREATE INDEX IF NOT EXISTS api_keys_project_idx ON api_keys(project_id);
