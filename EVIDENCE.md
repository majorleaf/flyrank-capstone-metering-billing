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
