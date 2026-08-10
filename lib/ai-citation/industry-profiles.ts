// Per-industry AI-visibility scope defaults: which topic angles to pre-check and
// what competitor hint to show in the pre-run scope drawer. Keyed by keyword match
// against the (free-text) industry string, so the 200+ industries collapse to ~10
// high-signal profiles with a safe fallback. "integration" and "localPin" mirror
// the generator's own business-type bending (lib/ai-citation/prompts.ts) so we do
// not pre-check angles that would only produce nonsense for that business type.

export type TopicKey =
  | "best-of" | "comparison" | "alternatives" | "integration" | "use-case" | "pricing-roi" | "vertical";

// User-facing topic toggles (best-of + branded are auto-added, not toggles).
export const TOPIC_TOGGLES: { key: TopicKey; label: string; hint: string }[] = [
  { key: "comparison", label: "Head-to-head vs competitors", hint: "X vs Y - pure share-of-voice" },
  { key: "alternatives", label: "Alternatives / switching", hint: "who AI offers instead of you" },
  { key: "integration", label: "Integrations / compatibility", hint: "works-with Jira / Slack / payroll" },
  { key: "pricing-roi", label: "Pricing / value / ROI", hint: "cost + worth-it queries" },
  { key: "use-case", label: "Use-case / which tool does X", hint: "capability-anchored" },
  { key: "vertical", label: "By segment / vertical", hint: "best for [your segment]" },
];

export interface IndustryProfile {
  suggestedTopics: TopicKey[];   // pre-checked in the drawer (4-6 high-signal)
  competitorHint: string;        // placeholder coaching for the competitor input
  includeIntegration: boolean;   // is "integration" meaningful for this business type?
  localPin: boolean;             // force near-me / in-[city] framing?
}

const PROFILES: Record<string, IndustryProfile> = {
  "workforce-analytics": { suggestedTopics: ["best-of", "comparison", "alternatives", "integration", "use-case"], competitorHint: "e.g. Hubstaff, Time Doctor, ActivTrak, Teramind", includeIntegration: true, localPin: false },
  "project-management": { suggestedTopics: ["best-of", "comparison", "alternatives", "integration", "use-case"], competitorHint: "e.g. Asana, Monday, ClickUp, Jira", includeIntegration: true, localPin: false },
  "dev-tools": { suggestedTopics: ["best-of", "comparison", "alternatives", "integration", "use-case"], competitorHint: "e.g. GitHub, GitLab, CircleCI, Datadog", includeIntegration: true, localPin: false },
  "fintech": { suggestedTopics: ["best-of", "comparison", "alternatives", "pricing-roi", "integration"], competitorHint: "e.g. Razorpay, Stripe, Cashfree", includeIntegration: true, localPin: false },
  "mental-health": { suggestedTopics: ["best-of", "alternatives", "use-case", "pricing-roi"], competitorHint: "e.g. BetterHelp, Talkspace, Wysa", includeIntegration: false, localPin: true },
  "ecommerce": { suggestedTopics: ["best-of", "comparison", "alternatives", "use-case"], competitorHint: "e.g. the 3-4 brands you lose carts to", includeIntegration: false, localPin: false },
  "local-services": { suggestedTopics: ["best-of", "use-case", "pricing-roi", "alternatives"], competitorHint: "e.g. nearby competitors in your city", includeIntegration: false, localPin: true },
  "agency": { suggestedTopics: ["best-of", "comparison", "alternatives", "use-case"], competitorHint: "e.g. peer agencies you pitch against", includeIntegration: true, localPin: false },
  "saas": { suggestedTopics: ["best-of", "comparison", "alternatives", "integration", "pricing-roi"], competitorHint: "e.g. your top 3-4 named rivals", includeIntegration: true, localPin: false },
  default: { suggestedTopics: ["best-of", "comparison", "alternatives", "use-case"], competitorHint: "e.g. the products buyers compare you against", includeIntegration: false, localPin: false },
};

/** Resolve a free-text industry to its scope profile by keyword match. */
export function profileForIndustry(industry: string | null | undefined): IndustryProfile {
  const s = (industry ?? "").toLowerCase();
  const has = (...kw: string[]) => kw.some((k) => s.includes(k));
  if (has("workforce", "employee monitor", "productivity track", "time track", "attendance")) return PROFILES["workforce-analytics"];
  if (has("project management", "task management", "work management")) return PROFILES["project-management"];
  if (has("developer", "devops", "dev tool", "infrastructure", "ci/cd", "observability")) return PROFILES["dev-tools"];
  if (has("fintech", "payment", "banking", "lending", "financial", "insurance", "wealth")) return PROFILES["fintech"];
  if (has("mental health", "therapy", "wellness", "counsel", "meditation", "healthcare")) return PROFILES["mental-health"];
  if (has("ecommerce", "e-commerce", "retail", "dtc", "consumer goods", "apparel", "food")) return PROFILES["ecommerce"];
  if (has("clinic", "salon", "dental", "restaurant", "spa", "gym", "home service", "local")) return PROFILES["local-services"];
  if (has("agency", "marketing services", "consult", "studio")) return PROFILES["agency"];
  if (has("saas", "software", "b2b", "platform", "app")) return PROFILES["saas"];
  return PROFILES.default;
}
