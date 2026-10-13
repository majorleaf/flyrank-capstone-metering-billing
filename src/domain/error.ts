import type { UsageType } from "./types.js";

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

export class QuotaExceededError extends Error {
  constructor(
    public readonly details: {
      readonly type: UsageType;
      readonly used: number;
      readonly limit: number;
      readonly requested: number;
      readonly retryAfterSeconds: number;
    },
  ) {
    super(
      `Monthly ${details.type} quota exceeded: used ${details.used} of ${details.limit}, requested ${details.requested}. Upgrade your plan or wait for the next period.`,
    );
    this.name = "QuotaExceededError";
  }
}

export class PaymentRequiredError extends Error {
  constructor(public readonly tenantStatus: string) {
    super(`Subscription is ${tenantStatus}. Update payment to continue.`);
    this.name = "PaymentRequiredError";
  }
}

export class InvalidTokenUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenUsageError";
  }
}