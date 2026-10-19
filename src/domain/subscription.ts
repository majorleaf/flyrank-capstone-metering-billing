import type Stripe from "stripe";

export interface TenantBillingState {
  readonly planId: "free" | "pro";
  readonly tenantStatus: "active" | "past_due";
}

export function mapSubscriptionStatus(status: Stripe.Subscription.Status): TenantBillingState | null {
  switch (status) {
    case "active":
    case "trialing":
      return { planId: "pro", tenantStatus: "active" };
    case "past_due":
    case "unpaid":
      return { planId: "pro", tenantStatus: "past_due" };
    case "canceled":
    case "incomplete_expired":
      return { planId: "free", tenantStatus: "active" };
    default:
      return null; // incomplete, paused: no change
  }
}