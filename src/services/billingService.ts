import type { Pool } from "pg";
import type Stripe from "stripe";
import { AlreadySubscribedError, CheckoutSessionError, TenantNotFoundError } from "../domain/error.js";
import * as tenantRepo from "../repositories/tenantRepository.js";

export interface BillingConfig {
  readonly proPriceId: string;
  readonly appBaseUrl: string;
}

export class BillingService {
  constructor(
    private readonly pool: Pool,
    private readonly stripe: Stripe,
    private readonly cfg: BillingConfig,
  ) {}

  async createProCheckout(tenantId: string): Promise<{ url: string }> {
    const tenant = await tenantRepo.getTenantBilling(this.pool, tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    if (tenant.planId === "pro" && tenant.status === "active") {
      throw new AlreadySubscribedError(tenant.planId);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.cfg.proPriceId, quantity: 1 }],
      client_reference_id: tenantId,
      metadata: { tenant_id: tenantId },
      subscription_data: { metadata: { tenant_id: tenantId } },
      ...(tenant.stripeCustomerId ? { customer: tenant.stripeCustomerId } : {}),
      success_url: `${this.cfg.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.cfg.appBaseUrl}/billing/cancel`,
    });

    if (!session.url) throw new CheckoutSessionError();
    return { url: session.url };
  }
}