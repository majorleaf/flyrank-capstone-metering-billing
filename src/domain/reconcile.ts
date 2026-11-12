import type Stripe from "stripe";
import { mapSubscriptionStatus, type TenantBillingState } from "./subscription.js";

const FREE: TenantBillingState = { planId: "free", tenantStatus: "active" };

export function deriveTenantState(
    statuses: readonly Stripe.Subscription.Status[],
): TenantBillingState {
    const mapped = statuses
    .map(mapSubscriptionStatus)
    .filter((s): s is TenantBillingState => s !== null);
    return (
        mapped.find((s) => s.planId !== "pro" && s.tenantStatus === "active") ??
        mapped.find((s) => s.planId === "pro" ) ??
        FREE
    );
}