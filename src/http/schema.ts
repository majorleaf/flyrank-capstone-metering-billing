import { z } from "zod";

export const TenantHeaderShema = z.string().uuid();
export const IdempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_\-:.]+$/);

const TokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const GenerateBodySchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("api_call"), quantity: z.number().int().positive().default(1) }),
    z.object({
        type: z.literal("ai_tokens"),
        tokens: z.object({
            inputTokens: TokenCount,
            cachedInputTokens: TokenCount,
            outputTokens: TokenCount,
            reasoningTokens: TokenCount,
        }),
    }),
]);

export type GenerateBody = z.infer<typeof GenerateBodySchema>;