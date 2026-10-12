## Metering: exactly one usage event per idempotency key

Command: `npx tsx src/scratch/meterTry.ts cd550aad-7822-4c29-91d3-f91efaa10ec6` (same request, key `demo-1`, sent twice)

Output: {
  eventId: 'c088b686-6d96-47ee-ac6c-8bcb42358c4b',
  type: 'api_call',
  quantity: 1,
  replayed: false
}
{
  type: 'api_call',
  eventId: 'c088b686-6d96-47ee-ac6c-8bcb42358c4b',
  quantity: 1,
  replayed: true
}

Row count: RES_DB" -c "SELECT idempotency_key, count(*) FROM usage_events GROUP BY 1"'
 idempotency_key | count 
-----------------+-------
 demo-1          |     1
(1 row)

PROBE 2: 
   Probe 2’s service-level behavior is proven:
 --Calls 1-3 succeed, and call 3 lands exactly on the limit (3 of 3), which is allowed.
  --Call 4 is rejected with a clear message (used 3 of 3, requested 1).
  --The replay of call 3 returns the original eventId with replayed: true, not a 429.

call 1 {
  eventId: '5060155c-3140-4312-a741-509470b49469',
  type: 'api_call',
  quantity: 1,
  replayed: false
}
call 2 {
  eventId: '889cbade-8a53-456b-9d02-36fd030fd05b',
  type: 'api_call',
  quantity: 1,
  replayed: false
}
call 3 (boundary) {
  eventId: '77647fc6-a6c1-4b29-920c-becae62dcb5d',
  type: 'api_call',
  quantity: 1,
  replayed: false
}
call 4 REJECTED: Monthly api_call quota exceeded: used 3 of 3, requested 1. Upgrade your plan or wait for the next period.
replay of call 3 {
  type: 'api_call',
  eventId: '77647fc6-a6c1-4b29-920c-becae62dcb5d',
  quantity: 1,
  replayed: true
}
