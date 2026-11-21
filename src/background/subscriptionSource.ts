import type Stripe from "stripe";
import { withRetry, type RetryOptions } from "./retry.js";

export interface SubscriptionSnapshot {
    readonly customerId: string;
    readonly status: Stripe.Subscription.Status;
    readonly priceIds: string[];
}

export interface SubscriptionSource {
    fetchAll(): Promise<SubscriptionSnapshot[]>;
}

export class StripeSubscriptionSource implements SubscriptionSource {
    constructor(
        private readonly stripe: Stripe,
        private readonly retry: RetryOptions,
    ) {}

    fetchAll(): Promise<SubscriptionSnapshot[]> {

        return withRetry(async () => {
            const out: SubscriptionSnapshot[] = [];
            for await (const sub of this.stripe.subscriptions.list({ status: "all", limit: 100})) { 
            out.push({
                customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
                status: sub.status,
                priceIds: sub.items.data.map((i) => i.price.id),
            });
        }
        return out;
        }, this.retry);
    }
}