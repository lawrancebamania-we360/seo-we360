// Page-level header for AI Visibility. Matches the SEO Blog Board v2 header
// convention (a plain white h1 + one-line subtitle, exactly like the Overview
// screen): in the comp the only ember panel inside the visibility view is the
// in-report brand-visibility hero band (score ring + stat cluster), which now
// lives inside the client on the Overview tab. So the page title stays a clean
// anchor rather than a second competing ember band. Presentational only — the
// client owns all state, actions and run wiring.
export function AiVisibilityHero() {
  return (
    <div>
      <h1 className="font-heading text-4xl leading-tight font-bold tracking-tight text-foreground sm:text-5xl">AI Visibility</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        See whether ChatGPT, Claude, Perplexity and Google AI recommend you for the questions your buyers actually ask - across personas and topics, and against the competitors who beat you.
      </p>
    </div>
  );
}
