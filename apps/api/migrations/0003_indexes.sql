-- Analytics-oriented indexes + BRIN on observed_at.

CREATE INDEX IF NOT EXISTS idx_transactions_project_endpoint
  ON transactions(project_id, endpoint_id);

CREATE INDEX IF NOT EXISTS idx_transactions_from_wallet
  ON transactions(from_wallet);

CREATE INDEX IF NOT EXISTS idx_transactions_chain_status
  ON transactions(chain, status);

CREATE INDEX IF NOT EXISTS brin_transactions_observed_at
  ON transactions USING BRIN (observed_at) WITH (pages_per_range = 32);

-- Partitioned tables require the partition key in every unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_chain_tx
  ON transactions(chain, tx_hash, observed_at);
