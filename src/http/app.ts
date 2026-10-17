import express, { type Express } from "express";
import type { MeterService } from "../services/meterService.js";
import type { UsageService } from "../services/usageService.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { generateRoutes } from "./routes/generate.js";
import { usageRoutes }from "./routes/usage.js";


export interface AppDeps {
    readonly meter: MeterService;
    readonly usage: UsageService;
}

export function createApp(deps: AppDeps): Express {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "100kb" }));
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.use(generateRoutes(deps.meter));
    app.use(usageRoutes(deps.usage));
      app.use((_req, res) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });
    app.use(errorHandler);
    return app;
}