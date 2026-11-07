# BUILDLOG.md

AI-usage log for the Usage Metering & Billing Engine. Tool: Claude, used as a step-by-step pair-programming partner. I ran, debugged and committed everything. Entries marked **[mine]** are changes I made myself.

## 1. How I used AI

| Area | AI role | My role |
|---|---|---|
| Design decisions | Proposed options with trade-offs | Chose: UTC calendar-month period, inclusive boundary (`used + requested <= limit`), 429 for quota and 402 for non-active tenants, `X-Tenant-Id` header, zod validation, cached tokens counted inside input tokens, pinned prices |
| Schema (`001_init.sql`) | Drafted | Ran it, verified tables, reset volumes when needed |
| `config.ts`, `pool.ts` | Drafted | Wired up, made Stripe vars required in Phase 3 [mine] |
| `MeterService`, repositories, `quotaService`, `usageService` | Drafted in slices | Typed and ran each slice, fixed my own transcription errors |
| `pricing.ts` + tests | Drafted | Ran mutation check |
| HTTP layer, billing, webhooks | Drafted | Wrote `server.ts` myself [mine], debugged wiring |
| Vitest integration tests | Drafted | Ran, fixed failures, ran lock mutation check |
| Stripe setup | Walked through steps | Created sandbox, product, price, CLI login |

## 2. Where the AI was wrong or unhelpful

1. **Ignored the collaboration request.** Early replies dumped full code and a four-step plan after I asked to build step by step. Corrected after I pushed back.
2. **Wrong claim about config.** It said a strict zod schema would reject placeholder Stripe values. It would not (`sk_test_replace_me` starts with `sk_test_`). It corrected itself.
3. **Over-complicated the compose filename.** The `capstone.yml` vs `capstone.yaml` warning confused me. `.yml` and `.yaml` are the same format. I kept `docker-compose.yml`.
4. **Placeholder id bug (found by me running it).** First `record()` stored `eventId: "pending"` in the response snapshot, so replays failed Probe 1. Fixed by generating the UUID with `randomUUID()` before the insert.
5. **Ambiguous instruction.** "Replace `RecordUsageInput`/`RecordUsageResult`" in `types.ts` made me think `UsageType` should go. Whole file was re-posted.
6. **Wrong test prediction.** It predicted the "rounds half up" test would also fail when I changed the cached price. It stayed green. A green test only guards what it asserts.
7. **Incomplete lock prediction.** It predicted only the quota-race test would fail without `FOR UPDATE`. The concurrent-retry test also failed (raw unique-constraint error). The lock does two jobs.
8. **Status mapping correction.** It first said a "canceled but not deleted" state would set tenant status `canceled`. Stripe sends `canceled` together with `deleted`, so that state never exists alone. The `canceled` CHECK value is unused.
9. **zod v4 API.** Generated `import { ZodError } from "zod"`, which failed on my version. Fixed with `z.ZodError`.
10. **Stale file names.** AI referred to `errors.ts`, `webhooks.ts`, `webhookService.ts`. My files are `error.ts`, `webhook.ts`, `webhookServices.ts`. I matched imports to disk.
11. **Hand-built shell quoting** for psql one-liners was fragile. Switched to simpler commands.

## 3. Bugs I introduced (caught by tooling, not the AI)

| Bug | Caught by | Fix |
|---|---|---|
| `INSERT` column list vs `VALUES` count mismatch (several rounds) | Postgres at runtime; `tsx` does not type-check and SQL is a string | Rewrote the query on one line, counted columns, placeholders, values |
| `idempotencyKey` reached the DB as null | `NOT NULL` constraint | Fixed property name |
| `input.type` typed `string` | `tsc` | Corrected `RecordUsageInput` to `UsageType` |
| `asserWithinQuota` typo; stale `sumUsage` signature | `tsc` | Renamed; fixed signature |
| `sripe_customer_id` typo | Postgres error on first checkout call | Fixed column name; `grep -rn sripe src` |
| 404 handler at module top level | `tsc` | Moved inside `createApp` |
| `"err.message"` as a string literal; `quota_exceeeded`; `idemptency_key_reused` | Manual curl, then the automated test | Fixed in `errorHandler.ts` |
| `app.listen(0, resolve)` type error | `tsc` | Wrapped callback; first edit had not saved |
| `server.ts` exited silently with code 0 | Exit code check | Added the missing `listen` call [mine] |

The `quota_exceeeded` typo survived two manual curl checks and was caught by the first automated assertion.

## 4. Environment problems (not code)

- Port 5432 already in use: moved host port to 5433.
- `.env` credentials changed after the volume existed: needed `docker compose down -v`.
- Postgres "starting up" errors: added a `pg_isready` wait loop.
- `esbuild` platform mismatch from installing in Windows and running in WSL: reinstalled `node_modules`, then stuck to one shell.
- WSL had no network (ping to 8.8.8.8 failed): installed Stripe CLI on Windows via winget instead.
- `stripe` not recognized after install: refreshed PATH in the session.
- CLI 1.54 requires `--events` for `stripe listen`.
- Confused `prod_` with `price_`: config rejects `prod_` by design.
- Picked the correct environment (student sandbox, not Test mode) during `stripe login`.

## 5. Security notes

- Pasted Stripe CLI output containing a customer name and email, and a `whsec_` signing secret, into chat. Test-mode only, but treated as exposed. Won't be committed. Rotate the webhook secret by re-running `stripe login`.
- `git log --all --oneline -- .env` printed nothing; `git check-ignore .env` printed `.env`.
- Live-key guard: `config.ts` rejects any `STRIPE_SECRET_KEY` not starting with `sk_test_`.

## 6. Verification I ran myself

- Probe 1: same key twice gives one row and the same `eventId` (script, then tests).
- Probe 2: boundary at limit 3 and over HTTP at limit 2 (429 with `Retry-After`); replay at the boundary returns the original success.
- Probe 3: Free to Pro via replayed `checkout.session.completed`; `/usage` limit went 1000 to 50000.
- Probe 4: forged signature gives 400 with the tenant unchanged; replay gives `outcome: 'duplicate'` and one `stripe_events` row.
- Probe 5: 19,000 micros for the cached and reasoning case.
- Mutation checks: cached price 250,000 to 300,000 failed with `expected 19200n to be 19000n`. Removing `FOR UPDATE` failed 2 tests; restored, 21 pass.

## 7. Known limitations (documented, not fixed)

- Out-of-order Stripe events can overwrite newer state (needs a `last_event_created` column).
- Two subscriptions for one tenant: cancelling one downgrades the tenant.
- Tenant identity is trusted from `X-Tenant-Id`; production would use API keys.
- Tokens are simulated; no model is called.
- No invoicing, proration or overage.

## 8. Things I can explain line by line

- The `UNIQUE (tenant_id, idempotency_key)` constraint and why the lock comes first.
- Why the quota check sits after the idempotency lookup.
- Why `bigint` and integer micros are used, and where rounding happens.
- Why the webhook route uses `express.raw()` before `express.json()`.
- Why dedup insert and plan update share one transaction.

## 9. Still to log

- Background job (reconciliation): <fill in when built>
- `npm run migrate` / `npm run seed`: <fill in>
- README and `capstone.yaml`: <fill in>