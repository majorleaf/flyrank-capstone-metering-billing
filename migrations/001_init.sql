-- migrations/001_init.sql
BEGIN;

CREATE TABLE plans (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  api_calls_limit BIGINT NOT NULL CHECK (api_calls_limit >= 0),
  ai_tokens_limit BIGINT NOT NULL CHECK (ai_tokens_limit >= 0),
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  stripe_price_id TEXT UNIQUE
);

CREATE TABLE tenants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  plan_id            TEXT NOT NULL DEFAULT 'free' REFERENCES plans(id),
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'past_due', 'canceled')),
  stripe_customer_id TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  plan_id                TEXT NOT NULL REFERENCES plans(id),
  status                 TEXT NOT NULL,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_tenant_idx ON subscriptions (tenant_id);

CREATE TABLE usage_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  type              TEXT NOT NULL CHECK (type IN ('api_call', 'ai_tokens')),
  quantity          BIGINT NOT NULL CHECK (quantity > 0),
  token_breakdown   JSONB,
  cost_micros       BIGINT NOT NULL CHECK (cost_micros >= 0),
  idempotency_key   TEXT NOT NULL,
  request_hash      TEXT NOT NULL,
  response_snapshot JSONB NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usage_events_idem_uq UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX usage_events_rollup_idx ON usage_events (tenant_id, type, occurred_at);

CREATE TABLE stripe_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name, api_calls_limit, ai_tokens_limit, price_cents) VALUES
  ('free', 'Free', 1000, 100000, 0),
  ('pro',  'Pro',  50000, 5000000, 2900);

COMMIT;