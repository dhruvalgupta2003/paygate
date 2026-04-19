-- Replay-protection ledger for incoming Stripe webhooks.
-- The webhook handler INSERTs ON CONFLICT DO NOTHING and skips side
-- effects when the conflict fires, preventing duplicate side effects
-- from Stripe retries or signed-event replay attacks.

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pruning policy lives in a future cron / vacuum job.  Keeping a small
-- index on processed_at makes range deletes cheap when we add it.
CREATE INDEX IF NOT EXISTS stripe_processed_events_processed_at_idx
  ON stripe_processed_events(processed_at);
