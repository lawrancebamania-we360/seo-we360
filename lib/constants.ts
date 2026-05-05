// Centralised tunables. When a value needs to change — SLA, page size,
// retry count — change it here, not at the call site.
//
// Keep constants grouped by domain. New values go with their neighbours.

// ------------------------------------------------------------
// HTTP + external APIs
// ------------------------------------------------------------
export const HTTP = {
  /** Max ms to wait on a Razorpay API call before aborting. */
  RAZORPAY_TIMEOUT_MS: 15_000,
  /** Max ms to wait on a Razorpay refund before aborting. */
  RAZORPAY_REFUND_TIMEOUT_MS: 15_000,
  /** Max ms to wait on a Razorpay payment fetch before aborting. */
  RAZORPAY_FETCH_TIMEOUT_MS: 10_000,
  /** Max ms to wait on a single Apify actor run. */
  APIFY_ACTOR_TIMEOUT_MS: 18_000,
  /** Max ms to wait on an AI (Claude / OpenAI) call. */
  AI_CALL_TIMEOUT_MS: 60_000,
  /** Max ms to wait on a PageSpeed Insights call. */
  PAGESPEED_TIMEOUT_MS: 30_000,
  /** Max ms to wait on a URL fetch inside the SEO-skill crawler. */
  CRAWL_FETCH_TIMEOUT_MS: 8_000,
} as const;

// ------------------------------------------------------------
// Audit + crawl pipeline
// ------------------------------------------------------------
export const AUDIT = {
  /** Default max URLs the full-site audit crawls in one run. */
  DEFAULT_MAX_URLS: 50,
  /** Ceiling — lets the user opt-in to a deeper one-shot run. */
  MAX_URLS_CEILING: 100,
  /** Floor — anything smaller is probably a misconfig. */
  MIN_URLS_FLOOR: 5,
} as const;

// ------------------------------------------------------------
// Article-writer word-count targets
// ------------------------------------------------------------
export const ARTICLE = {
  WORD_TARGET_LOW: 1_400,     // Low Competition keyword
  WORD_TARGET_MED: 2_000,     // Medium Competition keyword
  WORD_TARGET_HIGH: 2_800,    // High Competition keyword
  WORD_TARGET_DEFAULT: 1_500, // Fallback when competition is unknown
} as const;

// ------------------------------------------------------------
// Billing + entitlements
// ------------------------------------------------------------
export const BILLING = {
  /** Typical Apify refresh-cycle cost in cents (used to pre-gate before the run). */
  APIFY_REFRESH_ESTIMATE_CENTS: 130,
  /** Trial length — keep in sync with the cron schedule at /api/cron/trial-expiry. */
  TRIAL_LENGTH_DAYS: 15,
  /** Razorpay webhook retry cap before we give up logging attempts. */
  WEBHOOK_MAX_RETRIES: 10,
} as const;
