import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { 
    IdempotencyKeyReusedError,
    InvalidQuantityError,
    InvalidTokenUsageError,
    PaymentRequiredError,
    QuotaExceededError,
    TenantNotFoundError,
} from "../../domain/error.js"

interface ErrorBody {
    readonly error: string;
    readonly message: string;
    readonly details?: unknown; 
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    if (res.headersSent) {
        next(err);
        return;
    }
    const send = (status: number, body: ErrorBody): void => {
        res.status(status).json(body);
    };

    if (err instanceof z.ZodError) {
        return send(400, { error: "invalid_request", message: "Invalid request", details: err.issues });
    }
    if (err instanceof QuotaExceededError) {
        res.setHeader("Retry-After", String(err.details.retryAfterSeconds ));
        return send(429, { error: "quota_exceeeded", message: err.message, details: err.details });
    }
    if (err instanceof PaymentRequiredError ) {
        return send(402, { error: "payment_required", message: err.message });
    }
    if (err instanceof IdempotencyKeyReusedError) {
        return send(422, { error:"idempotency_key_reused", message: err.message });
    }
    if (err instanceof TenantNotFoundError) {
        return send(404, { error: "tenant_not_found", message: err.message});
    }
    if (err instanceof InvalidQuantityError) {
        return send(400, { error: "invalid_usage", message: err.message});
    }
    if (err instanceof SyntaxError) {
        return send(400, { error: "invalid_json", message: err.message });
    }
    
    console.error("unhandled error", { name: err instanceof Error ? err.name : typeof err});
    send(500, { error: "internal_error", message: "Internal server error "})
}