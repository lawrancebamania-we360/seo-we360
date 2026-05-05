import { load, type CheerioAPI } from "cheerio";
import type { AuditContext } from "./types";

export interface FetchedPage {
  $: CheerioAPI;
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  fetchMs: number;
  contentBytes: number;
}

export async function fetchPage(url: string, timeoutMs = 10000): Promise<FetchedPage> {
  const start = Date.now();
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "We360SeoBot/1.0 (+https://we360.ai)",
      "accept": "text/html,application/xhtml+xml",
    },
  });
  const html = await res.text();
  const fetchMs = Date.now() - start;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  const $ = load(html);
  return {
    $,
    html,
    statusCode: res.status,
    headers,
    fetchMs,
    contentBytes: html.length,
  };
}

export function buildContext(
  url: string,
  page: FetchedPage,
  project: AuditContext["project"]
): AuditContext {
  return {
    url,
    html: page.html,
    $: page.$,
    responseHeaders: page.headers,
    statusCode: page.statusCode,
    fetchMs: page.fetchMs,
    contentBytes: page.contentBytes,
    project,
  };
}
