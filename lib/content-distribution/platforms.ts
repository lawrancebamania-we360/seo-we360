// Content distribution: the platforms the team publishes we360 content to, and
// who owns each. The daily cron fetches the feed-capable ones server-side; the
// rest (LinkedIn, Quora, Google Sites, ghost, telegra.ph) are pulled via
// Claude-in-Chrome into the same ingest. Each detected post is recorded as a
// Backlink Submission (assigned to the owner) and credits a Team Target:
//   - Tanu's 3rd-party platforms -> "Blog Submissions on 11 platforms"
//   - the web2.0 blogs -> the owner's "Listicles" target (listicles live on web2.0)

export type FeedParser = "rss" | "devto" | "blogger";

// Which Team Target a post on this platform credits.
export type TargetSpec =
  | { type: "task"; task: string }          // a fixed target, matched by task name (e.g. Tanu's)
  | { type: "owner_keyword"; keyword: string }; // the owner's target whose task contains this word

export interface Platform {
  key: string;                 // stable id
  label: string;
  /** backlink_websites.domain to find-or-create (matches the team's existing rows). */
  websiteDomain: string;
  ownerFirstName: string;      // resolved to a profile at runtime
  feedUrl: string;
  parser: FeedParser;
  target: TargetSpec;
}

const BLOG_SUBMISSIONS: TargetSpec = { type: "task", task: "Blog Submissions on 11 platforms" };
const LISTICLES: TargetSpec = { type: "owner_keyword", keyword: "listicle" };

// Only the platforms that expose a public feed/API (hands-off server cron). The
// login/JS platforms (LinkedIn, Quora, Google Sites, ghost, telegra.ph,
// indibloghub, sooperarticles, vocal) are handled via Claude-in-Chrome.
export const FEED_PLATFORMS: Platform[] = [
  // Tanu - 3rd-party submission sites -> her "Blog Submissions on 11 platforms".
  { key: "devto",    label: "dev.to",   websiteDomain: "dev.to",   ownerFirstName: "Tanu", feedUrl: "https://dev.to/api/articles?username=we360_ai&per_page=30", parser: "devto",   target: BLOG_SUBMISSIONS },
  { key: "medium",   label: "Medium",   websiteDomain: "medium",   ownerFirstName: "Tanu", feedUrl: "https://we360ai.medium.com/feed", parser: "rss", target: BLOG_SUBMISSIONS },
  { key: "substack", label: "Substack", websiteDomain: "substack", ownerFirstName: "Tanu", feedUrl: "https://we360ai.substack.com/feed", parser: "rss", target: BLOG_SUBMISSIONS },
  { key: "tumblr",   label: "Tumblr",   websiteDomain: "tumblr",   ownerFirstName: "Tanu", feedUrl: "https://we360-ai.tumblr.com/rss", parser: "rss", target: BLOG_SUBMISSIONS },
  { key: "blogger",  label: "Blogger",  websiteDomain: "blogger",  ownerFirstName: "Tanu", feedUrl: "https://we360blogs.blogspot.com/feeds/posts/default?alt=json&max-results=30", parser: "blogger", target: BLOG_SUBMISSIONS },

  // Web2.0 blogs - the owners' listicles live here -> their "Listicles" target.
  { key: "wp-workplaceinsights", label: "workplaceinsights.business.blog", websiteDomain: "workplaceinsights.business.blog", ownerFirstName: "Naveen",  feedUrl: "https://workplaceinsights.business.blog/feed/", parser: "rss", target: LISTICLES },
  { key: "wp-productivityguide", label: "productivityguide.wordpress.com", websiteDomain: "productivityguide.wordpress.com", ownerFirstName: "Naveen",  feedUrl: "https://productivityguide.wordpress.com/feed/", parser: "rss", target: LISTICLES },
  { key: "wp-remoteworkguide",   label: "remoteworkguide.home.blog",       websiteDomain: "remoteworkguide.home.blog",       ownerFirstName: "Lokesh",  feedUrl: "https://remoteworkguide.home.blog/feed/", parser: "rss", target: LISTICLES },
  { key: "wp-productivityhub",   label: "productivityhub.tech.blog",       websiteDomain: "productivityhub.tech.blog",       ownerFirstName: "Namrata", feedUrl: "https://productivityhub.tech.blog/feed/", parser: "rss", target: LISTICLES },
];
