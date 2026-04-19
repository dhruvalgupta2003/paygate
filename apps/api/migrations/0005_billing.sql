-- Stripe billing fields on projects.
-- billing_status mirrors the latest subscription state seen via webhook.
-- A project with stripe_customer_id = NULL is unbilled (events skip the meter).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_status         TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS billing_period_start   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_period_end     TIMESTAMPTZ;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_billing_status_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_billing_status_check
    CHECK (billing_status IN ('inactive','trialing','active','past_due','canceled','unpaid'));

-- Stripe customer IDs are globally unique within a Stripe account.  We index
-- uniquely so the webhook handler can look up the project in O(1) by customer.
CREATE UNIQUE INDEX IF NOT EXISTS projects_stripe_customer_id_idx
  ON projects(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
