export class IdempotencyKeyReusedError extends Error {
  constructor(public readonly key: string) {
    super(`Idempotency key "${key}" was already used with a different request`);
    this.name = "IdempotencyKeyReusedError";
  }
}

export class TenantNotFoundError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant ${tenantId} not found`);
    this.name = "TenantNotFoundError";
  }
}