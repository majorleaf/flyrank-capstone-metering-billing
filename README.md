# flyrank-capstone-metering-billing
    # Usage Metering & Billing Engine

A backend service that answers three questions every SaaS must answer: **how much has this tenant used, what does it cost, and have they hit their plan limit?** It meters API calls and AI tokens, enforces monthly quotas, calculates cost in integer micro-units, and keeps plans in sync with Stripe (test mode) through signature-verified, idempotent webhooks.

Stack: Node.js 22, TypeScript (strict), Express, PostgreSQL 16 (Docker), zod, Stripe test mode, Vitest.

## Architecture

```
                        ┌──────────────────────────────────────────┐
Client ── POST /generate ─▶ routes ─▶ MeterService                  │
         (X-Tenant-Id,     (zod)      1. lock tenant row            │
          Idempotency-Key)            2. idempotency lookup         │
                                      3. quota check (QuotaService) │
                                      4. cost (pricing.ts)          │
                                      5. insert usage_event, commit │
                                                  │                  │
Client ── GET /usage ───────▶ UsageService ──▶ rollup(usage_events)  │
                                                  ▼                  │
Client ── POST /billing/checkout ▶ BillingService ▶ Stripe Checkout  │
                                                  PostgreSQL         │
Stripe ── POST /webhooks/stripe ▶ raw body ─▶ verify signature       │
         (signed)                  ─▶ dedup (stripe_events)          │
                                   ─▶ update tenant plan/status      │
                        └──────────────────────────────────────────┘
```

Layers (each talks only to the one below it):

| Layer | Folder | Rule |
|---|---|---|
| HTTP | `src/http/` | Parses and validates requests, maps domain errors to status codes. No SQL, no business rules. |
| Logic | `src/services/` | Idempotency, quota, billing and webhook rules. No Express, no raw SQL. |
| Data | `src/repositories/` | SQL only. |
| Domain | `src/domain/` | Pure types, errors, pricing, period helpers. |

## Setup

Prerequisites: Node 22+, Docker, and the [Stripe CLI](https://docs.stripe.com/stripe-cli). A free Stripe account in **test mode or a sandbox** is enough. No credit card is needed.

```bash
git clone <repo-url> && cd flyrank-capstone-metering-billing
cp .env.example .env          # then fill in the values below
npm install
docker compose up -d
npm run db:wait               # waits until Postgres accepts connections
npm run migrate               # applies migrations/*.sql
npm run seed                  # links the Pro price, creates the demo tenant
npm start                     # listens on :8000
npm test                      # needs Postgres up
```

`.env` values:

| Variable | Where it comes from |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Choose any values. |
| `DATABASE_URL` | `postgres://<user>:<password>@localhost:5433/<db>` (host port 5433 maps to the container's 5432). |
| `STRIPE_SECRET_KEY` | Stripe dashboard, Developers, API keys (`sk_test_...`). Live keys are rejected at boot. |
| `STRIPE_PRO_PRICE_ID` | Create a `Pro` product with a recurring $29.00/month price. Copy the `price_...` id (not `prod_...`). |
| `STRIPE_WEBHOOK_SECRET` | Printed by `stripe listen` (`whsec_...`). |
| `PORT`, `APP_BASE_URL` | Defaults: `8000` and `http://localhost:8000`. |

The demo tenant is `00000000-0000-4000-8000-000000000001` (Free plan).

### Stripe webhooks locally

```bash
stripe login
stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:8000/webhooks/stripe
```

Copy the printed `whsec_...` into `.env` and restart the server. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.

## API

All tenant-scoped endpoints take `X-Tenant-Id: <uuid>`. Tenant identity is trusted from this header (see Limitations).

### `POST /generate`: billable action

Headers: `X-Tenant-Id`, `Idempotency-Key` (8 to 128 characters of `A-Z a-z 0-9 _ - : .`), `Content-Type: application/json`.

```bash
T=00000000-0000-4000-8000-000000000001

# API call
curl -s -X POST localhost:8000/generate -H "X-Tenant-Id: $T" \
  -H "Idempotency-Key: demo-key-0001" -H "Content-Type: application/json" \
  -d '{"type":"api_call"}'

# AI tokens (simulated counts)
curl -s -X POST localhost:8000/generate -H "X-Tenant-Id: $T" \
  -H "Idempotency-Key: demo-key-0002" -H "Content-Type: application/json" \
  -d '{"type":"ai_tokens","tokens":{"inputTokens":10000,"cachedInputTokens":4000,"outputTokens":2000,"reasoningTokens":1000}}'
```

Response `200`: `{ "eventId", "type", "quantity", "costMicros", "replayed" }`. Cost is a string because it is a 64-bit integer.

### `GET /usage`

```bash
curl -s localhost:8000/usage -H "X-Tenant-Id: $T"
```

Returns `used`, `limit` and `costMicros` per usage type for the current UTC month, plus `totalCostMicros`.

### `POST /billing/checkout`

Returns `{ "url": "https://checkout.stripe.com/..." }`. Open it and pay with the test card. The plan changes only when the verified webhook arrives, never from the redirect.

### `POST /webhooks/stripe`

Called by Stripe. Requires a valid `Stripe-Signature`.

### `GET /health`

Returns `{ "status": "ok" }`.

### Status codes

| Code | Meaning |
|---|---|
| 200 | Success, including an idempotent replay (`replayed: true`) |
| 400 | Invalid or missing input, bad webhook signature |
| 402 | Tenant status is `past_due` or `canceled` (payment required) |
| 404 | Unknown tenant or route |
| 409 | Tenant is already on Pro |
| 422 | Idempotency key reused with a different payload |
| 429 | Monthly quota exceeded. Includes `Retry-After` (seconds until the next UTC month) and a message with `used`, `limit` and `requested` |
| 502 | Stripe unavailable |

Errors are JSON: `{ "error": "<code>", "message": "..." }`.

## Rules

### Plans

| Plan | API calls / month | AI tokens / month | Price |
|---|---|---|---|
| Free | 1,000 | 100,000 | $0 |
| Pro | 50,000 | 5,000,000 | $29 |

### Quota boundary

A request is allowed while `used + requested <= limit`. With a limit of 1,000, call 1,000 succeeds and call 1,001 returns **429**. A **replay** of an already-accepted request returns the original success, even at the boundary, because the idempotency lookup runs before the quota check. The period is the **UTC calendar month**. The token quota counts `input + output + reasoning` tokens, with cached tokens counted once (they are a subset of input).

### Idempotency

Every `/generate` call needs an `Idempotency-Key`, unique per tenant. Same key and same payload returns the stored response (`replayed: true`) and creates no new event. Same key with a different payload returns 422. Exactly-once is enforced by `UNIQUE (tenant_id, idempotency_key)` plus a `SELECT ... FOR UPDATE` lock on the tenant row, which also serializes concurrent requests so two requests at 999 of 1,000 cannot both pass.

### Pricing (pinned in `src/domain/pricing.ts`)

All money is an integer in micro-units (1 USD = 1,000,000 micros), calculated in `bigint`.

| Item | Price |
|---|---|
| Fresh input tokens | $1.00 / 1M |
| Cached input tokens | $0.25 / 1M |
| Output tokens | $4.00 / 1M |
| Reasoning tokens | $4.00 / 1M (billed as output) |
| API call | $0.001 |

`input_tokens` includes cached tokens, so fresh = input minus cached. Categories are priced separately and summed, then rounded **half up, once**, at the end. Example: 10,000 input (4,000 cached) + 2,000 output + 1,000 reasoning = 6,000 x $1 + 4,000 x $0.25 + 3,000 x $4 per million = **19,000 micros**. Cost is computed once and stored per event, so a later price change never rewrites history.

### Stripe to plan mapping

| Stripe | Tenant becomes |
|---|---|
| Checkout completed, or subscription `active` / `trialing` | `pro`, `active` |
| Subscription `past_due` / `unpaid` | `pro`, `past_due` (billable calls return 402) |
| Subscription `canceled` / `incomplete_expired`, or `deleted` event | `free`, `active` |

Webhooks verify the signature on the raw body (forged returns 400 and changes nothing), then insert the event id into `stripe_events` in the same transaction as the update. A replayed event is acknowledged with 200 and ignored.

## Data model

Migrations live in `migrations/` and are applied by `npm run migrate`, which records applied files in `schema_migrations` and is safe to rerun. Tables: `plans`, `tenants`, `subscriptions`, `usage_events` (indexed on `(tenant_id, type, occurred_at)`), `stripe_events`. Every usage row carries a `tenant_id`, and all queries filter on it.

## Testing

```bash
npm test
```

Vitest runs against the real Postgres, with no mocks. Each test creates its own tenant on a `test_tiny` plan (limit 3) and cleans up, so `free` and `pro` are never modified. Covered: idempotent replay, key reuse, concurrent retries, boundary and replay at the boundary, concurrent requests at 2 of 3, 402 and 429 over HTTP, token cost (19,000 micros), pricing rules and rounding. Proofs for each requirement are in `EVIDENCE.md`.

## Project layout

```
src/
  config.ts              env validation (zod); rejects non-test Stripe keys
  server.ts              wires dependencies and listens
  db/                    pool, migrate, seed
  domain/                types, errors, pricing, period, subscription mapping
  repositories/          SQL only
  services/              meter, quota, usage, billing, webhook
  http/                  app factory, routes, schemas, error handler
  test/helpers.ts        test fixtures
migrations/              SQL schema
```

## Limitations

- **Tenant identity is trusted from `X-Tenant-Id`.** There is no authentication. Production would derive the tenant from an API key.
- **Out-of-order Stripe events** can overwrite newer state. A `last_event_created` column and a skip-if-older check would fix it.
- **One subscription per tenant is assumed.** Paying twice creates two, and cancelling one downgrades the tenant.
- **AI tokens are simulated.** No model is called.
- **No invoicing, proration or overage billing.**
- **No background reconciliation job yet** (see Roadmap).
- **Single currency (USD)** and a single price version (`PRICING_V1`).

## Roadmap

Nightly reconciliation job comparing the database with Stripe's view, with retries and a failure alert. Overage billing. Usage alerts at 80% and 100%.

## Security

Secrets live only in `.env`, which is git-ignored. `.env.example` holds placeholders. `config.ts` refuses any Stripe key that does not start with `sk_test_`. Logs record ids, event types and outcomes, never keys, signatures or customer data.