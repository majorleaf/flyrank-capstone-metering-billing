
import { InvalidTokenUsageError } from "./error.js";

export interface TokenUsage {
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
}

export interface TokenPricing {
    readonly version: string;
    readonly freshInputMicrosPerMillion: bigint;
    readonly cachedInputMicrosPerMillion: bigint;
    readonly outputMicrosPerMillion: bigint;
}

//1 USD = 1_000_000 queueMicrotask. Prices are per 1M InvalidTokenUsageError.
export const PRICING_V1: TokenPricing = Object.freeze({
    version: "v1",
    freshInputMicrosPerMillion: 1_000_000n,
    cachedInputMicrosPerMillion: 250_000n,
    outputMicrosPerMillion: 4_000_000n,
});

export const API_CALL_PRICE_MICROS = 1_000n; // $0.001 per call
const MILLION = 1_000_000n;

function assertCount(name: string, n: number): void {
    if (!Number.isSafeInteger(n) || n < 0) {
        throw new InvalidTokenUsageError(`${name} must be a non-negative integer`);

    }
}

export function validateTokenUsage(u: TokenUsage): void {
    assertCount("inputTokens", u.inputTokens);
    assertCount("cachedInputTokens", u.cachedInputTokens);
    assertCount("outputTokens", u.outputTokens);
    assertCount("reasoningTokens", u.reasoningTokens);
    if (u.cachedInputTokens > u.inputTokens) {
        throw new InvalidTokenUsageError("cachedInputTokens cannot exceed inputTokens");
    }
} 

export function computeTokenCostMicros(
    usage: TokenUsage,
    pricing: TokenPricing = PRICING_V1,
): bigint {
    validateTokenUsage(usage);

    const fresh = BigInt(usage.inputTokens - usage.cachedInputTokens);
    const cached = BigInt(usage.cachedInputTokens);
    const billableOutput = BigInt(usage.outputTokens) + BigInt(usage.reasoningTokens);

    const numerator = 
      fresh * pricing.freshInputMicrosPerMillion +
      cached * pricing.cachedInputMicrosPerMillion +
      billableOutput * pricing.outputMicrosPerMillion;

    return (numerator + MILLION / 2n) / MILLION;
}

export function totalBillableTokens(u: TokenUsage): number {
    validateTokenUsage(u);
    return u.inputTokens + u.outputTokens + u.reasoningTokens;
}