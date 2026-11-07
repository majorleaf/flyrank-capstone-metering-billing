# EVIDENCE.md

Legend:  proven with real output ·  pending

## 1. Metering: one usage event per idempotency key (Probe 1) 

Automated (`npm test`, real Postgres): `same key twice creates one event and mirrors the response`, `same key with a different payload is rejected`, `concurrent retries of one key create one event`.

One-off manual run (script since deleted, replaced by the tests above):
```
{ eventId: 'c088b686-6d96-47ee-ac6c-8bcb42358c4b', type: 'api_call', quantity: 1, replayed: false }
{ type: 'api_call', eventId: 'c088b686-6d96-47ee-ac6c-8bcb42358c4b', quantity: 1, replayed: true }
 idempotency_key | count
-----------------+-------
 demo-1          |     1
```

Over HTTP (same `Idempotency-Key`, same body, sent twice):
```
POST /generate -> 200 {"eventId":"3dec2bf8-b154-48cd-8133-da3c87883d84","type":"api_call","quantity":1,"costMicros":"1000","replayed":false}
POST /generate -> 200 {"type":"api_call","eventId":"3dec2bf8-b154-48cd-8133-da3c87883d84","quantity":1,"replayed":true,"costMicros":"1000"}
```
Key reuse with a different body returns 422 `idempotency_key_reused`: test `key reuse with a different body returns 422`.

Missing headers give a clean 400, not a 500:
```
POST /generate (no X-Tenant-Id) -> 400 {"error":"invalid_request","message":"Invalid request", ...}
```

## 2. Quotas (Probe 2) 

Rule: allowed while `used + requested <= limit`. The request that would exceed it gets 429 with `Retry-After`. A non-active tenant gets 402.

One-off manual run, limit 3 (script since deleted):
```
call 1 { eventId: '5060155c-...', quantity: 1, replayed: false }
call 2 { eventId: '889cbade-...', quantity: 1, replayed: false }
call 3 (boundary) { eventId: '77647fc6-...', quantity: 1, replayed: false }
call 4 REJECTED: Monthly api_call quota exceeded: used 3 of 3, requested 1. Upgrade your plan or wait for the next period.
replay of call 3 { eventId: '77647fc6-...', replayed: true }
```

Over HTTP, limit 2 (tenant had 1 call):
```
boundary call -> HTTP/1.1 200 OK  {"eventId":"b247a4a1-...","quantity":1,"costMicros":"1000","replayed":false}
next call     -> HTTP/1.1 429 Too Many Requests, Retry-After: 1267351
```

Automated: `allows the call that lands on the limit, rejects the next`, `a replay at the boundary returns the original success`, `two concurrent requests at 2 of 3 admit exactly one`, `a past_due tenant gets a payment-required error`, `over the limit returns 429 with Retry-After and a message`, `past_due returns 402`.

Mutation check (row lock guards the race): 
Removed `FOR UPDATE` from `lockTenant`, ran `npm test`:
 × concurrent retries of one key create one event
     error: duplicate key value violates unique constraint "usage_events_idem_uq"
 × two concurrent requests at 2 of 3 admit exactly one
     expected [ ... ] to have a length of 1 but got 2
 Tests 2 failed | 19 passed (21)
Restored `FOR UPDATE`:
 Test Files 3 passed (3)   Tests 21 passed (21)

## 3. Cost calculation (Probe 5) 

Pinned in `src/domain/pricing.ts`: fresh input $1.00/1M, cached $0.25/1M, output and reasoning $4.00/1M, `API_CALL_PRICE_MICROS = 1000`. Half-up rounding, once, in bigint.

- `pricing.test.ts`: 7 tests. 10,000 input (4,000 cached) + 2,000 output + 1,000 reasoning = 19,000 micros.
- Mutation check: cached price 300,000 failed with `expected 19200n to be 19000n`; reverted.
- `ai_tokens` stored: quantity 13000, cost 19000 (`meterService.test.ts`).
- `GET /usage` rollup:
```
"apiCalls":{"used":1,"limit":1000,"costMicros":"1000"},"aiTokens":{"used":13000,"limit":100000,"costMicros":"19000"},"totalCostMicros":"20000"
```

## 4. Stripe (Probes 3 and 4)

### 4a. Checkout session 
```
POST /billing/checkout -> 200 {"url":"https://checkout.stripe.com/c/pay/cs_test_..."}
```
Stripe side (student sandbox): session `status: complete`, `payment_status: paid`; subscription `sub_1URmXCFUUPa66TPpUEj67IiQ` `status: active`, price `price_1URVPhFUUPa66TPp8kuUO6fb`, `metadata.tenant_id` set.

### 4b. Free to Pro via webhook (Probe 3) 
```
Before: /usage "limit":1000 / "limit":100000    tenants: free | active |
Action: stripe events resend evt_1URmXDFUUPa66TPpMcY0C0rj
After:  /usage "limit":50000 / "limit":5000000  tenants: pro | active | cus_VShxMmQzHP8HYh
```

### 4c. Forged signature returns 400 (Probe 4) 
```
POST /webhooks/stripe  Stripe-Signature: t=1,v1=bad
HTTP/1.1 400 Bad Request
{"error":"invalid_signature","message":"Signature verification failed"}
```
Tenant unchanged: <Tenant before forged request:  pro | active
Forged request:                HTTP/1.1 400 Bad Request
                               {"error":"invalid_signature","message":"Signature verification failed"}
Tenant after forged request:   pro | active   (unchanged) `SELECT plan_id, status FROM tenants` run right after>

### 4d. Replay processed once (Probe 4) 
```
2026-10-23 22:57:42 <-- [200] POST /webhooks/stripe [evt_1URmXDFUUPa66TPpMcY0C0rj]
2026-10-23 22:59:59 <-- [200] POST /webhooks/stripe [evt_1URmXDFUUPa66TPpMcY0C0rj]
```
```
           event_id           |            type
 evt_1URmXDFUUPa66TPpMcY0C0rj | checkout.session.completed
(1 row)

Server log on the replayed delivery:
webhook handled { eventId: 'evt_1URmXDFUUPa66TPpMcY0C0rj', type: 'checkout.session.completed', outcome: 'duplicate' }

## 5. Automated test run 
```
$ npm test
 ✓ src/domain/pricing.test.ts (7 tests)
 ✓ src/services/meterService.test.ts (8 tests)
 ✓ src/http/app.test.ts (6 tests)
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

## 6. Shared requirements 

| # | Requirement | Proof |
|---|---|---|
| 1 | Layered architecture | `http/` → `services/` → `repositories/` → Postgres |
| 2 | Validation at boundary | `missing headers return 400, never 500`, `unknown tenant returns 404` |
| 3 | Background job, retries, failure alert | PENDING |
| 4 | Persistence, migrations, indexes, isolation | `migrations/001_init.sql`, `UNIQUE (tenant_id, idempotency_key)`, `usage_events_rollup_idx` |
| 5 | Idempotency | Sections 1 and 4d |
| 6 | Secrets clean | `git log --all -- .env`: <PASTE output, should be empty> |
| 7 | AI cost tracked | Tokens are simulated; cost stored per event in `cost_micros` |

## 7. Submission pack ⏳
- README, diagram, limitations: PENDING
- `capstone.yaml`: PENDING
- `npm run migrate` and `npm run seed`: PENDING