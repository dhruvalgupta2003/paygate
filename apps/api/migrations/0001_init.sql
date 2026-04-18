-- PayGate API initial schema.
-- All tables carry BIGINT ids where possible; primary keys are UUIDs stored as TEXT
-- to keep ORM-agnostic reads cheap in analytics queries.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  owner_wallet  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endpoints (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path_glob          TEXT NOT NULL,
  method             TEXT[] NOT NULL DEFAULT '{}',
  price_usdc_micros  BIGINT NOT NULL CHECK (price_usdc_micros >= 0),
  tags               TEXT[] NOT NULL DEFAULT '{}',
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_endpoints_project ON endpoints(project_id);

-- transactions is partitioned by month on observed_at — see 0002.
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID NOT NULL,
  project_id          UUID NOT NULL,
  endpoint_id         UUID,
  chain               TEXT NOT NULL,
  tx_hash             TEXT NOT NULL,
  block_or_slot       BIGINT,
  amount_usdc_micros  BIGINT NOT NULL,
  from_wallet         TEXT NOT NULL,
  to_wallet           TEXT NOT NULL,
  nonce               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('pending','settled','refunded','reorged','upstream_failed')),
  settled_at          TIMESTAMPTZ,
  observed_at         TIMESTAMPTZ NOT NULL,
  redacted_at         TIMESTAMPTZ,                  -- set by DSR redact; GDPR
  PRIMARY KEY (id, observed_at)
) PARTITION BY RANGE (observed_at);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_project_at ON rate_limit_events(project_id, at DESC);

CREATE TABLE IF NOT EXISTS compliance_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_events_project_at ON compliance_events(project_id, at DESC);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id                   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url                          TEXT NOT NULL,
  events                       TEXT[] NOT NULL,
  secret                       TEXT NOT NULL,
  secret_hash                  TEXT,                        -- legacy, optional
  enabled                      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at                   TIMESTAMPTZ,
  previous_secret              TEXT,                         -- 10-min overlap during rotation
  previous_secret_expires_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id     UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
  event               TEXT NOT NULL,
  url                 TEXT NOT NULL,
  payload             JSONB NOT NULL,
  attempt             INT NOT NULL DEFAULT 0,
  max_attempts        INT NOT NULL DEFAULT 12,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','delivered','failed','dead','delivering')),
  next_attempt_at     TIMESTAMPTZ,
  last_response_code  INT,
  last_response_body  TEXT,
  last_error          TEXT,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_next ON webhook_deliveries(status, next_attempt_at) WHERE status = 'pending';

-- Hash-chained append-only audit log.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY,
  project_id  UUID,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   TEXT NOT NULL,
  row_hash    TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_log_project_at ON audit_log(project_id, at);

-- DSR tombstones — redact wallets from analytics without losing totals.
CREATE TABLE IF NOT EXISTS dsr_tombstones (
  wallet     TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
