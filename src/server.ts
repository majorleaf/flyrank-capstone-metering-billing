import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { stripe } from "./billing/stripeClient.js";
import { createApp } from "./http/app.js";
import { BillingService } from "./services/billingService.js";
import { MeterService } from "./services/meterService.js";
import { UsageService } from "./services/usageService.js";

const app = createApp({ 
    meter: new MeterService(pool), 
    usage: new UsageService(pool),
    billing: new BillingService(pool, stripe, {
        proPriceId: config.STRIPE_PRO_PRICE_ID,
        appBaseUrl: config.APP_BASE_URL,
    })
});
const server = app.listen(config.PORT, () => {
  console.log(`listening on :${config.PORT}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());