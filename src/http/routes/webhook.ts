import express, { Router, type Request, type Response, type NextFunction } from "express";
import type Stripe from "stripe";
import type { WebhookService } from "../../services/webhookServices.js";

export function webhookRoutes(stripe: Stripe, service: WebhookService, secret: string): Router {
  const router = Router();
  router.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req: Request, res: Response, next: NextFunction) => {
      const signature = req.header("Stripe-Signature");
      if (!signature || !Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "invalid_signature", message: "Missing signature or body" });
        return;
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, secret);
      } catch (err: unknown) {
        console.error("webhook verification failed", { name: err instanceof Error ? err.name : typeof err });
        res.status(400).json({ error: "invalid_signature", message: "Signature verification failed" });
        return;
      }

      try {
        const outcome = await service.handle(event);
       console.info("webhook handled", { eventId: event.id, type: event.type, outcome });
        res.status(200).json({ received: true, outcome });
      } catch (err: unknown) {
        next(err); // 500 makes Stripe retry
      }
    },
  );
  return router;
}