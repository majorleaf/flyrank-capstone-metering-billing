export type UsageType = "api_call" | "ai_tokens";

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
