# EVIDENCE.md

Status legend: ✅ proven with real output · ⏳ pending

## 1. Metering: exactly one usage event per idempotency key (Probe 1)  ✅

### 1a. Service level

Command: `npx tsx src/scratch/meterTry.ts <tenant-uuid>` (same request, key `demo-1`, sent twice)

```
{ eventId: 'c088b686-6d96-47ee-ac6c-8bcb42358c4b', type: 'api_call', quantity: 1, replayed: false }
{ type: 'api_call', eventId: 'c088b686-6d96-47ee-ac6c-8bcb42358c4b', quantity: 1, replayed: true }
```

Row count:

```
 idempotency_key | count
-----------------+-------
 demo-1          |     1
(1 row)
```

### 1b. Over HTTP

Same `Idempotency-Key: http-test-0001`, same body, sent twice (headers trimmed):

```
POST /generate  -> 200 {"eventId":"3dec2bf8-b154-48cd-8133-da3c87883d84","type":"api_call","quantity":1,"costMicros":"1000","replayed":false}
POST /generate  -> 200 {"type":"api_call","eventId":"3dec2bf8-b154-48cd-8133-da3c87883d84","quantity":1,"replayed":true,"costMicros":"1000"}
```

Same key, different body (`quantity: 5`) is rejected as key reuse:

```
POST /generate  -> 422  <PENDING: re-run after the "idempotency_key_reused" spelling fix, paste real output>
```

Missing headers give a clean 4xx, not a 500:

```
POST /generate (no X-Tenant-Id)  -> 400
{"error":"invalid_request","message":"Invalid request","details":[{"expected":"string","code":"invalid_type","path":[],"message":"Invalid input: expected string, received undefined"}]}
```

## 2. Quotas (Probe 2)

Boundary rule: a request is allowed while `used + requested <= limit`. The request that would exceed the limit gets 429. 402 is reserved for `past_due` / `canceled` tenants.

### 2a. Service level, limit temporarily 3  ✅

```
call 1 { eventId: '5060155c-3140-4312-a741-509470b49469', type: 'api_call', quantity: 1, replayed: false }
call 2 { eventId: '889cbade-8a53-456b-9d02-36fd030fd05b', type: 'api_call', quantity: 1, replayed: false }
call 3 (boundary) { eventId: '77647fc6-a6c1-4b29-920c-becae62dcb5d', type: 'api_call', quantity: 1, replayed: false }
call 4 REJECTED: Monthly api_call quota exceeded: used 3 of 3, requested 1. Upgrade your plan or wait for the next period.
replay of call 3 { type: 'api_call', eventId: '77647fc6-a6c1-4b29-920c-becae62dcb5d', quantity: 1, replayed: true }
```

A replay at the boundary returns the original success, not a 429.

### 2b. Over HTTP, limit temporarily 2 (tenant already had 1 call)

Boundary call (used 2 of 2, allowed):

```
HTTP/1.1 200 OK
{"eventId":"b247a4a1-0ec3-40c4-a869-4161671a3f5a","

### 4c. Forged signature returns 400, nothing changes (Probe 4)  ✅

```
$ curl -s -i -X POST localhost:8000/webhooks/stripe -H "Stripe-Signature: t=1,v1=bad" -H "Content-Type: application/json" -d '{}'
HTTP/1.1 400 Bad Request
{"error":"invalid_signature","message":"Signature verification failed"}
```

Tenant row before and after: `free | active` (unchanged).

### 4d. Replayed event processed once (Probe 4)  ✅

Same event delivered twice via `stripe events resend evt_1URmXDFUUPa66TPpMcY0C0rj`:

2026-10-23 22:57:42  <--  [200] POST /webhooks/stripe [evt_1URmXDFUUPa66TPpMcY0C0rj]
2026-10-23 22:59:59  <--  [200] POST /webhooks/stripe [evt_1URmXDFUUPa66TPpMcY0C0rj]

stripe_events table after both deliveries:
           event_id           |            type
------------------------------+----------------------------
 evt_1URmXDFUUPa66TPpMcY0C0rj | checkout.session.completed
(1 row)

tenants: pro | active | cus_VShxMmQzHP8HYh