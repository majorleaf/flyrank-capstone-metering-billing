import type { TokenUsage } from "./pricing.js";

export const USAGE_TYPES = ["api_call", "ai_tokens"] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

export function isUsageType(value: unknown): value is UsageType {
  return typeof value === "string" && (USAGE_TYPES as readonly string[]).includes(value);
}

interface BaseInput {
    readonly tenantId: string;
    readonly idempotencyKey: string;
}

export interface ApiCallInput extends BaseInput {
    readonly type: "api_call";
    readonly quantity: number;
}

export interface AiTokensInput extends BaseInput {
  readonly type: "ai_tokens";
  readonly tokens: TokenUsage;
}

export type RecordUsageInput = ApiCallInput | AiTokensInput;

export interface RecordUsageResult {
    readonly eventId: string;
    readonly type: UsageType;
    readonly quantity: number;
    readonly costMicros: string;
    readonly replayed: boolean;
}
