import "dotenv/config";
import { z } from "zod";

const blankToUndefined = (v: unknown): unknown => (v === "" ? undefined : v);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Phase 3: remove .optional() on all three
  STRIPE_SECRET_KEY: z.preprocess(
    blankToUndefined,
    z.string().startsWith("sk_test_", "Test mode keys only").optional(),
  ),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    blankToUndefined,
    z.string().startsWith("whsec_").optional(),
  ),
  STRIPE_PRO_PRICE_ID: z.preprocess(
    blankToUndefined,
    z.string().startsWith("price_").optional(),
  ),
});

export type Config = Readonly<z.infer<typeof EnvSchema>>;

function loadConfig(): Config {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(",")}: ${i.message}`);
        throw new Error(`Invalid environment:\n${issues.join("\n")}`);
    }
    return Object.freeze(parsed.data);
}

export const config: Config = loadConfig();

