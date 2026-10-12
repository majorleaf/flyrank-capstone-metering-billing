export const USAGE_TYPES = ["api_call", "ai_tokens"] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

export function isUsageType(value: unknown): value is UsageType {
  return typeof value === "string" && (USAGE_TYPES as readonly string[]).includes(value);
}

export interface RecordUsageInput {
    readonly tenantId: string;
    readonly type: string;
    readonly quantity: number;
    readonly idempotencyKey: string;
}

export interface RecordUsageResult {
    readonly eventId: string;
    readonly type: UsageType;
    readonly quantity: number;
    readonly replayed: boolean;
}
