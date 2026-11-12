// Pure, client-safe shared types + constants for competitor Top Pages.
// Kept out of lib/data/competitor-top-pages.ts because that module imports the
// server-only Supabase client (next/headers) and so can't be pulled into a
// client component's bundle.

export const PROJECT_KEY = "__project__";

export interface CompetitorTopPage {
  url: string;
  estimatedTraffic: number | null;
  trafficShare: number | null;
  rank: number;
}

export interface CompetitorTopPagesGroup {
  domain: string | null;
  fetchedAt: string | null;
  pages: CompetitorTopPage[];
}
