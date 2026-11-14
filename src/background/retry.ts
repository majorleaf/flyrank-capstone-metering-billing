import Stripe from "stripe";

export interface  RetryOptions {
    readonly attempts: number;
    readonly baseDelayMs: number;
    readonly isRetryable: (err: unknown) => boolean;
    readonly sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => 
    new Promise((resolve) => setTimeout(resolve, ms));

export function isRetryableStripeError(err: unknown): boolean {
    return (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeRateLimitError ||
    err instanceof Stripe.errors.StripeAPIError
   );
}

export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions): Promise<T> {
    const sleep = o.sleep ?? realSleep;
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            if (attempt >= o.attempts || !o.isRetryable(err)) throw err;
            await sleep(o.baseDelayMs * 2 ** (attempt  - 1));
        }
    }
}