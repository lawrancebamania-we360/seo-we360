// Centralized NEUTRAL example placeholders for form fields and hints.
//
// These strings are shown as input `placeholder=` text or inline "e.g. ..."
// hints across onboarding, project, article, competitor, topic-cluster,
// publish-URL, and bulk-upload forms. They are EXAMPLES the user types over -
// never real data.
//
// They MUST stay industry-agnostic. Do NOT seed them with any specific
// client's brand, domain, or vertical (it leaks one tenant's identity into
// every other tenant's UI, and dates the product to a single launch client).
// Pick neutral, broadly-recognizable software/SaaS examples instead.
//
// NOTE: this module is for CLIENT-EXAMPLE placeholders only. It is NOT for the
// operator's own product branding (the GoodLives support email, platform name,
// policy pages, etc.) - those are legitimate first-party strings and live
// where they're used.

/** Generic example domain. RFC 2606 reserves example.com for documentation. */
export const EXAMPLE_DOMAIN = "example.com";

/** Example competitor brand name. */
export const EXAMPLE_COMPETITOR_NAME = "Competitor Inc";

/** Example competitor URL (full https form). */
export const EXAMPLE_COMPETITOR_URL = "https://competitor.com";

/** Industry-neutral seed keyword for keyword / topic-cluster / article fields. */
export const EXAMPLE_SEED_KEYWORD = "project management software";

/**
 * A few example seed keywords (one per line) for multi-line keyword textareas.
 * Same neutral theme as EXAMPLE_SEED_KEYWORD.
 */
export const EXAMPLE_SEED_KEYWORDS_MULTILINE =
  "project management software\nbest project management tools\nproject management for small teams";

/** Industry-neutral example industry/vertical descriptor. */
export const EXAMPLE_INDUSTRY = "SaaS · Project Management";

/** Industry-neutral example project/brand NAME - never a real client's name. */
export const EXAMPLE_PROJECT_NAME = "Acme Inc";

/** Industry-neutral example blog/article title. */
export const EXAMPLE_ARTICLE_TITLE = "10 Best Project Management Tools (2026 Guide)";

/** Example published blog URL, built on the neutral example domain. */
export const EXAMPLE_PUBLISH_URL = `https://${EXAMPLE_DOMAIN}/blog/...`;

/** Example GSC property URL hint (covers both Domain and URL-prefix forms). */
export const EXAMPLE_GSC_PROPERTY = `sc-domain:${EXAMPLE_DOMAIN} or https://${EXAMPLE_DOMAIN}/`;

/**
 * Industry-neutral "brand facts" example for the brand-kit textarea.
 * One fact per line - mirrors how a user lists their own differentiators.
 */
export const EXAMPLE_BRAND_FACT = [
  "10+ years in business",
  "Trusted by 5,000+ teams",
  "99.9% uptime SLA",
  "SOC 2 Type II certified",
  "24/7 customer support",
].join("\n");

/**
 * Neutral example rows for the bulk-task TSV upload textarea.
 * Tab-separated columns: title, task_type, priority.
 */
export const EXAMPLE_BULK_TASK_ROWS =
  "title\ttask_type\tpriority\n" +
  "Write article: best project management software 2026\tNew Blog\thigh\n" +
  "Update existing blog: top productivity tools\tUpdate Blog\tmedium";

/** Reusable "(e.g. example.com)" hint fragment for domain validation errors. */
export const EXAMPLE_DOMAIN_HINT = `Enter a valid domain (e.g. ${EXAMPLE_DOMAIN})`;
