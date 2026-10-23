// Pure-function check for resolvePublishState (lib/data/blog-clusters.ts) - the
// write -> upload -> live state machine behind the To Publish queue and the
// cluster drawer badge. No database: it builds a sitemap index in memory and
// asserts the full state matrix, incl. the new rule that a draft attached to an
// already-live page is still "ready" (pending upload) until someone records the
// live URL here.
//
// Usage: npx tsx scripts/check-publish-state.ts

import { buildSitemapIndex } from "@/lib/url";
import { resolvePublishState } from "@/lib/data/blog-clusters";

const SITEMAP = [
  "https://www.we360.ai/solutions/workforce-analytics/", // an existing, live page
  "https://www.we360.ai/blog/existing-post/",
];
const idx = buildSitemapIndex(SITEMAP);
const DOC = "https://docs.google.com/document/d/abc"; // an attached draft artifact

let failures = 0;
function check(name: string, got: string, want: string) {
  if (got === want) console.log(`  ok  ${name} -> ${got}`);
  else { failures++; console.error(`  FAIL ${name}: got ${got}, want ${want}`); }
}
const stateOf = (item: Parameters<typeof resolvePublishState>[0]) => resolvePublishState(item, idx).state;

// 1. THE FIX: existing live page + draft attached, nothing marked published here.
check("existing live page + artifact",
  stateOf({ artifactUrl: DOC, publishedUrl: null, urlSlug: "we360.ai/solutions/workforce-analytics/", taskPublishedUrl: null }),
  "ready");

// 2. Brand-new page + draft, not on the web yet.
check("new page + artifact (not live)",
  stateOf({ artifactUrl: DOC, publishedUrl: null, urlSlug: "blog/brand-new-post", taskPublishedUrl: null }),
  "ready");

// 3. Marked published here + crawled -> Live (leaves the queue).
check("marked published + in sitemap",
  stateOf({ artifactUrl: DOC, publishedUrl: "https://www.we360.ai/blog/existing-post/", urlSlug: "blog/existing-post", taskPublishedUrl: null }),
  "live");

// 4. Marked published here + not crawled yet -> pending (not ready; own URL recorded).
check("marked published + not in sitemap",
  stateOf({ artifactUrl: DOC, publishedUrl: "https://www.we360.ai/blog/just-uploaded/", urlSlug: "blog/just-uploaded", taskPublishedUrl: null }),
  "published_pending");

// 5. Sprint-task published, not crawled, no draft -> pending (preserved behaviour).
check("task published + not in sitemap, no artifact",
  stateOf({ artifactUrl: null, publishedUrl: null, urlSlug: "blog/not-crawled", taskPublishedUrl: "https://www.we360.ai/blog/not-crawled/" }),
  "published_pending");

// 6. Sprint-task published + crawled, no draft -> Live.
check("task published + in sitemap, no artifact",
  stateOf({ artifactUrl: null, publishedUrl: null, urlSlug: "blog/existing-post", taskPublishedUrl: "https://www.we360.ai/blog/existing-post/" }),
  "live");

// 7. Existing live page, nothing in the pipeline -> Live (slug in sitemap).
check("existing live page, no artifact/no publish",
  stateOf({ artifactUrl: null, publishedUrl: null, urlSlug: "we360.ai/solutions/workforce-analytics/", taskPublishedUrl: null }),
  "live");

// 8. Nothing anywhere -> draft.
check("empty item",
  stateOf({ artifactUrl: null, publishedUrl: null, urlSlug: "blog/never", taskPublishedUrl: null }),
  "draft");

// 9. Existing live page after it was marked published here + draft still attached
//    -> Live (own URL recorded, so it's out of the queue, not ready).
check("existing page, marked published here, artifact still attached",
  stateOf({ artifactUrl: DOC, publishedUrl: "https://www.we360.ai/solutions/workforce-analytics/", urlSlug: "we360.ai/solutions/workforce-analytics/", taskPublishedUrl: null }),
  "live");

// Queue membership mirrors state === "ready": only #1 and #2 belong on To Publish.
const inQueue = (item: Parameters<typeof resolvePublishState>[0]) => resolvePublishState(item, idx).state === "ready";
check("existing-live-page update IS queued",
  String(inQueue({ artifactUrl: DOC, publishedUrl: null, urlSlug: "we360.ai/solutions/workforce-analytics/", taskPublishedUrl: null })), "true");
check("already-live (no artifact) is NOT queued",
  String(inQueue({ artifactUrl: null, publishedUrl: null, urlSlug: "we360.ai/solutions/workforce-analytics/", taskPublishedUrl: null })), "false");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
