---
name: verify-pending-articles
version: 1.0.0
description: |
  Run the daily AI verification pass for blog/page tasks that have moved
  to "Done" or "Published" in the SEO We360 dashboard. For each pending
  task: fetch the writer's Google Doc, run plagiarism / humanization /
  quality scoring, then perform brief-compliance analysis (you, Claude,
  do this part natively from the article + brief), and write the verdict
  back to Postgres. Pass = green "AI verified" badge on the kanban card;
  fail = red card with the issues list.

  Trigger this skill once a day, around 10:00 AM Asia/Kolkata. The user
  has already registered it via the schedule skill — this file is the
  per-invocation instruction sheet.
license: internal
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Verify pending articles

You are doing QA on articles that writers have moved to "Done" or "Published"
in the Blog Sprint kanban. Your job is to:

1. Pull the queue of pending verifications
2. For each one, run the full pipeline (fetch doc → score → analyze → finalize)
3. Report a one-line summary per task

The deterministic work (fetching, plagiarism searches, regex-based scoring)
runs in Node scripts. **Brief-compliance analysis is your job** — you read
the article and the brief side by side and decide whether the writer used
the recommended H1, H2s, internal links, brand-fixed CTAs, etc.

## Step 1 — list the queue

Run:

```bash
npx tsx scripts/verify/list-pending.ts
```

This returns a JSON array. Each item has `id` (the verification row id),
`task_id`, `title`, `target_keyword`, `source_type` (`google_doc` or
`live_url`), `source_url`, and `retry_count`.

If the array is empty, say "Nothing to verify today" and stop.

## Step 2 — for EACH item in the queue, do this loop

### 2a. Prepare

```bash
npx tsx scripts/verify/prepare.ts <verification_id>
```

This:

- Marks the verification as `running`
- Fetches the Google Doc (or live URL if the task moved to Published)
- Runs plagiarism / humanization / quality scoring and persists those
  partial results
- Outputs JSON to stdout with the doc text + brief + partial scores

If the script outputs `{"ok": false, "error": "doc_missing"}` or
`"doc_unreachable"`, the verification has already been written as failed.
**Skip to the next task** — there's no LLM analysis to do.

If the script throws, run `npx tsx scripts/verify/mark-retry.ts <id> "<msg>"`
and skip to the next task.

### 2b. Analyze brief compliance

You now have the doc text, the brief, and the partial scores. Read the
article carefully and decide whether the writer hit the brief. Specifically
check:

1. **Target keyword** — is `brief.target_keyword` present in the H1, the
   first paragraph, and at least one H2 heading?
2. **Recommended H1** — does the doc's H1 match (semantically, not exactly)
   `brief.recommended_h1`?
3. **H2 sections** — are the H2s in `brief.recommended_h2s` present in
   some form? Soft-flag anything missing.
4. **PAA coverage** — does the FAQ section answer the questions in
   `brief.paa_questions`? Soft-flag missing questions.
5. **Internal links** — are at least 3 inline internal links to /solutions,
   /vs, /alternative, /integrations, /industries paths? (The regex scorer
   already counts these; flag if it found < 3.)
6. **Brand-fixed CTAs** — does the doc include the We360 primary CTA
   (`Start Free Trial – No Credit Card`) and secondary CTA (`Book a Demo`)?
7. **Pricing line** — is `Starts at ₹299 per user/month` present anywhere
   when it should be (CTAs, pricing-related sections)?
8. **Trust line** — is `120K+ users · 10K+ companies · 21+ countries`
   present in the hero or final CTA section?
9. **Author byline** — is there a `By <Name>, <Title>. Published/Last
   updated: <date>.` line under the H1?
10. **Voice / readability** — does the doc sound like a real person? Look
    for the patterns the humanizer flags: em dash overuse, rule-of-three,
    AI vocabulary words, title-case headings, chatbot artifacts ("I hope
    this helps", "Let's dive in"). The regex scorer already produces a
    humanization score — corroborate with your own read.

For each issue you find, decide:

- **hard**: critical for SEO/brand integrity (missing target keyword, no
  CTAs, wrong intent, missing required JSON-LD blocks).
- **soft**: would improve the article but not blocking
  (some H2 missing, a PAA not answered, voice slightly stiff).
- **info**: noted but not actionable (e.g., "humanization score is borderline").

Build the result JSON like this and write it to `/tmp/claude_result_<id>.json`:

```json
{
  "briefAlignment": 0,
  "issues": [
    {
      "severity": "hard|soft|info",
      "category": "keyword|headings|internal_links|external_citations|schema|faq|meta|byline|plagiarism|humanization|readability|ctas|compliance",
      "code": "stable_short_code",
      "message": "User-facing description of what went wrong.",
      "suggestion": "(optional) How to fix it.",
      "evidence": "(optional) A short snippet of the offending text."
    }
  ],
  "notes": "(optional) 1-2 sentence summary of the article quality."
}
```

`briefAlignment` is your overall 0-100 score for how well the doc matches
the brief intent (keyword targeting, voice, structure). 80+ = aligned,
60-79 = partially aligned, below 60 = significant mismatch.

Use the `Write` tool to save this JSON to `/tmp/claude_result_<id>.json`.

### 2c. Finalize

```bash
npx tsx scripts/verify/finalize.ts <verification_id> /tmp/claude_result_<id>.json
```

This combines your LLM findings with the partial scores and writes the
final verdict to Postgres + mirrors it onto the task row (so the kanban
card updates immediately). It outputs the resulting verdict as JSON.

## Step 3 — summarize

When you've processed every item in the queue, output a one-line summary
per task:

```
✅ Lokesh - "We360 vs Activtrak" (page) — Verified · score 87 (↑12 from last run)
❌ Rahul - "Hybrid Work Isn't a Trend Anymore" (blog) — Failed · 2 hard, 3 soft
⚠️  Ishika - "Best work-from-home monitoring" — Doc not accessible (private doc)
```

Then a final tally: `N verified, M failed, K skipped (doc missing/unreachable)`.

## Notes

- **Be honest.** A regex scorer can miss subtle voice issues. Use your read
  to corroborate or correct the humanization score.
- **Don't be lenient on plagiarism.** If 3+ phrases are flagged on
  third-party domains, that's a hard fail regardless of context.
- **Brand strings are exact.** "Start Your Free Trial" is NOT the same as
  "Start Free Trial – No Credit Card". If the doc invented a CTA, soft-fail
  with the `ctas` category.
- **Update tasks** can use the same brief as new tasks. The verification
  flow is identical; the source URL just lives in the live blog instead
  of a draft Google Doc when the trigger is `done` (Published).
- Failures bump `retry_count`. After 3 retries, the task is marked
  permanently failed with status `failed` and a summary like "Retries
  exhausted: <error>".
