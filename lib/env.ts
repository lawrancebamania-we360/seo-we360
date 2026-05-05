import { z } from "zod";

// Centralised, zod-validated environment access. Import from here instead of
// reading process.env directly so typos and missing secrets surface immediately
// instead of causing mysterious 500s at runtime.
//
// Two categories:
//   1. Required — the app won't boot without these.
//   2. Optional — gated features (Apify, GA4, GSC, Resend); null is accepted.
//
// Empty strings are normalised to `undefined` for optional fields so that a blank
// `KEY=` line in .env.local behaves the same as the key being absent. Without this
// normalisation, `.optional()` would reject `""` and crash the app at first env()
// call. Feature gates (`if (!env().X)`) then uniformly see undefined.

/** Treat empty strings from process.env as "unset" for optional fields. */
const optionalSecret = (inner: z.ZodString) =>
  z.preprocess((v) => (typeof v === "string" && v === "" ? undefined : v), inner.optional());

const schema = z.object({
  // --- Public (browser-safe) ---
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: optionalSecret(z.string().url()),

  // --- Server-only secrets ---
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: optionalSecret(z.string().min(1)),

  // --- Optional integrations ---
  APIFY_TOKEN: z.string().optional(),
  APIFY_ACTOR_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  PAGESPEED_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

type Env = z.infer<typeof schema>;

function parse(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const pretty = parsed.error.issues
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    // Loud, fail-fast — the app will be unusable otherwise
    throw new Error(`Invalid environment variables:\n${pretty}`);
  }
  return parsed.data;
}

// Lazy-parse so tests / tooling that don't need env vars aren't blocked by them.
let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = parse();
  return cached;
}

// Typed feature-gate helpers — saves littering code with `process.env.X ? a : b`.
export function hasApify(): boolean {
  return !!env().APIFY_TOKEN;
}
export function hasResend(): boolean {
  return !!env().RESEND_API_KEY;
}
export function hasGoogleServiceAccount(): boolean {
  return !!env().GOOGLE_SERVICE_ACCOUNT_JSON;
}
