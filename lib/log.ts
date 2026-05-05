// Structured logger. Thin wrapper over console so we can swap Pino/Axiom later
// without touching call sites. One JSON line per event in prod — grep-friendly,
// ingestion-friendly. Human-readable in dev.
//
// Usage:
//   import { log } from "@/lib/log";
//   log.info("order.created", { orderId, amount });
//   log.error("webhook.failed", err, { eventId });
//
// Call signature keeps the "event" as the first positional argument so log
// grep / log-based alerts can key on a stable string, not a free-form message.

type Fields = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

function emit(level: "debug" | "info" | "warn" | "error", event: string, fields: Fields) {
  const record = {
    t: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  if (isProd) {
    // Single-line JSON — Vercel log drain + most aggregators parse this directly.
    const line = JSON.stringify(record);
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
    return;
  }
  // Dev: readable, colourless (works in any terminal / Next.js log pane).
  const tag = `[${level.toUpperCase()}] ${event}`;
  if (level === "error" || level === "warn") console.error(tag, fields);
  else console.log(tag, fields);
}

function errFields(err: unknown): Fields {
  if (err instanceof Error) {
    return { err: { name: err.name, message: err.message, stack: err.stack } };
  }
  return { err: String(err) };
}

export const log = {
  debug: (event: string, fields: Fields = {}) => emit("debug", event, fields),
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  error: (event: string, err?: unknown, fields: Fields = {}) =>
    emit("error", event, { ...(err !== undefined ? errFields(err) : {}), ...fields }),
};
