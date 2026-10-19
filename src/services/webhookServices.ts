import type { Pool, PoolClient } from "pg";
import type Stripe from "stripe";
import { z } from "zod";
import { mapSubscriptionStatus } from "../domain/subscription.js";
import * as repo from "../repositories/webhookRepository.js";

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

const TenantIdSchema = z.string().uuid();

function idOf(v: string | { id: string } | null): string | null {
  if (v === null) return null;
  return typeof v === "string" ? v : v.id;
}

export class WebhookService {
  constructor(
    private readonly pool: Pool,
    private readonly proPriceId: string,
  ) {}

  async handle(event: Stripe.Event): Promise<WebhookOutcome> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const isNew = await repo.recordEvent(client, event.id, event.type);
      if (!isNew) {
        await client.query("COMMIT");
        return "duplicate";
      }
      const outcome = await this.apply(client, event);
      await client.query("COMMIT");
      return outcome;
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async resolveTenant(
    client: PoolClient,
    metaTenantId: string | undefined,
    customerId: string | null,
  ): Promise<string | null> {
    const parsed = TenantIdSchema.safeParse(metaTenantId);
    if (parsed.success) return parsed.data;
    return customerId ? repo.findTenantByCustomer(client, customerId) : null;
  }

  private async apply(client: PoolClient, event: Stripe.Event): Promise<WebhookOutcome> {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode !== "subscription" || s.payment_status === "unpaid") return "ignored";
        const customerId = idOf(s.customer);
        const subscriptionId = idOf(s.subscription);
        const tenantId = await this.resolveTenant(
          client,
          s.client_reference_id ?? s.metadata?.tenant_id,
          customerId,
        );
        if (!tenantId || !customerId || !subscriptionId) return "ignored";

        const updated = await repo.applyTenantState(client, {
          tenantId, planId: "pro", status: "active", customerId,
        });
        if (!updated) return "ignored";
        await repo.upsertSubscription(client, {
          tenantId, stripeSubscriptionId: subscriptionId, planId: "pro", status: "active",
        });
        return "processed";
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        if (!sub.items.data.some((i) => i.price.id === this.proPriceId)) return "ignored";
        const customerId = idOf(sub.customer);
        const tenantId = await this.resolveTenant(client, sub.metadata?.tenant_id, customerId);
        if (!tenantId) return "ignored";

        const deleted = event.type === "customer.subscription.deleted";
        const state = deleted
          ? ({ planId: "free", tenantStatus: "active" } as const)
          : mapSubscriptionStatus(sub.status);
        if (!state) return "ignored";

        const updated = await repo.applyTenantState(client, {
          tenantId, planId: state.planId, status: state.tenantStatus, customerId,
        });
        if (!updated) return "ignored";
        await repo.upsertSubscription(client, {
          tenantId,
          stripeSubscriptionId: sub.id,
          planId: "pro",
          status: deleted ? "canceled" : sub.status,
        });
        return "processed";
      }

      default:
        return "ignored";
    }
  }
}