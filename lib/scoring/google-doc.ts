// Google Doc fetcher.
//
// Strategy: docs that are shared "Anyone with the link can view" expose a
// public export endpoint that returns plain text without any auth. If the
// doc is private, the export endpoint redirects to the Google login page,
// which we detect and surface as `error: "private_doc"` so the card shows
// "Doc not accessible — please share as 'Anyone with the link can view'".

import type { DocFetchResult } from "@/lib/types/verification";

// Pull the doc id out of a Google Doc URL. Supports the common formats:
//   https://docs.google.com/document/d/<ID>/edit
//   https://docs.google.com/document/d/<ID>/edit?usp=sharing
//   https://docs.google.com/document/d/<ID>
//   https://docs.google.com/document/u/0/d/<ID>/edit
export function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function fetchGoogleDocText(url: string): Promise<DocFetchResult> {
  const docId = extractGoogleDocId(url);
  if (!docId) {
    return {
      ok: false,
      url,
      textLength: 0,
      wordCount: 0,
      fetchedAt: new Date().toISOString(),
      error: "invalid_url",
    };
  }

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  try {
    const resp = await fetch(exportUrl, {
      redirect: "manual",  // catch the auth redirect
      headers: { "User-Agent": "We360-SEO-Verifier/1.0" },
    });

    // Public docs return 200 with text/plain. Private docs 30x to login.
    if (resp.status >= 300 && resp.status < 400) {
      return {
        ok: false,
        url,
        textLength: 0,
        wordCount: 0,
        fetchedAt: new Date().toISOString(),
        error: "private_doc",
      };
    }

    if (!resp.ok) {
      return {
        ok: false,
        url,
        textLength: 0,
        wordCount: 0,
        fetchedAt: new Date().toISOString(),
        error: `http_${resp.status}`,
      };
    }

    const text = await resp.text();

    // Sanity check — if we got HTML instead of text/plain, the doc was
    // probably gated. Doc export normally returns text with a UTF-8 BOM
    // and no HTML tags.
    if (text.trim().toLowerCase().startsWith("<!doctype html") ||
        text.trim().toLowerCase().startsWith("<html")) {
      return {
        ok: false,
        url,
        textLength: 0,
        wordCount: 0,
        fetchedAt: new Date().toISOString(),
        error: "private_doc",
      };
    }

    // Strip BOM, normalize line endings.
    const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");

    return {
      ok: true,
      url,
      textLength: clean.length,
      wordCount: countWords(clean),
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      url,
      textLength: 0,
      wordCount: 0,
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? `fetch_error: ${e.message}` : "fetch_error",
    };
  }
}

// Convenience: fetch and return both metadata + the actual text body.
//
// Strategy:
//   1) If GOOGLE_SERVICE_ACCOUNT_JSON is set, authenticate via the service
//      account and call the Drive API export endpoint. This works for docs
//      shared with the service account email (recommended path — admins
//      can keep docs private).
//   2) Fallback to the unauthenticated public export endpoint — works only
//      for docs shared as "Anyone with the link can view".
//
// We attempt SA auth first; on missing creds or auth failure we fall back
// to public export so existing setups don't break.
export async function fetchGoogleDocFull(url: string): Promise<{
  meta: DocFetchResult;
  text: string;
}> {
  const docId = extractGoogleDocId(url);
  if (!docId) {
    return {
      meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: "invalid_url" },
      text: "",
    };
  }

  // --- Path 1: service account (recommended) ---
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const result = await tryServiceAccountFetch(docId, url);
    if (result) return result;
    // null → SA creds missing/bad. Fall through to public-export path.
  }

  // --- Path 2: public export (fallback) ---
  return tryPublicExportFetch(docId, url);
}

async function tryServiceAccountFetch(docId: string, url: string): Promise<{ meta: DocFetchResult; text: string } | null> {
  try {
    const { google } = await import("googleapis");
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/documents.readonly",
      ],
    });
    const drive = google.drive({ version: "v3", auth });
    // Drive export returns the file body as plain text when mimeType=text/plain.
    const resp = await drive.files.export(
      { fileId: docId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    const text = String(resp.data ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    if (!text) {
      return { meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: "empty_doc" }, text: "" };
    }
    return {
      meta: { ok: true, url, textLength: text.length, wordCount: countWords(text), fetchedAt: new Date().toISOString() },
      text,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 403 / 404 from Drive = the SA doesn't have access. Surface a clear
    // "share with the SA email" hint via the meta error.
    if (/403|forbidden|404|notFound|file not found/i.test(msg)) {
      return {
        meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: "sa_not_shared" },
        text: "",
      };
    }
    // Other auth/network errors — fall back to public export so we don't
    // silently fail when SA creds are malformed but the doc is public.
    return null;
  }
}

async function tryPublicExportFetch(docId: string, url: string): Promise<{ meta: DocFetchResult; text: string }> {
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  try {
    const resp = await fetch(exportUrl, {
      redirect: "manual",
      headers: { "User-Agent": "We360-SEO-Verifier/1.0" },
    });
    if (resp.status >= 300 && resp.status < 400) {
      return { meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: "private_doc" }, text: "" };
    }
    if (!resp.ok) {
      return { meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: `http_${resp.status}` }, text: "" };
    }
    const raw = await resp.text();
    if (raw.trim().toLowerCase().startsWith("<!doctype html") || raw.trim().toLowerCase().startsWith("<html")) {
      return { meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: "private_doc" }, text: "" };
    }
    const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
    return {
      meta: { ok: true, url, textLength: text.length, wordCount: countWords(text), fetchedAt: new Date().toISOString() },
      text,
    };
  } catch (e) {
    return {
      meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: e instanceof Error ? `fetch_error: ${e.message}` : "fetch_error" },
      text: "",
    };
  }
}

// For Published tasks — fetch the live URL and strip HTML to plain text.
// We strip <script>, <style>, and tag noise but keep <h1>-<h6> markers as
// section breaks because the quality scorer needs to find them.
export async function fetchLiveUrlText(url: string): Promise<{ meta: DocFetchResult; text: string; html: string }> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "We360-SEO-Verifier/1.0 (+https://we360.ai)" },
      redirect: "follow",
    });
    if (!resp.ok) {
      return {
        meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: `http_${resp.status}` },
        text: "", html: "",
      };
    }
    const html = await resp.text();
    const text = htmlToText(html);
    return {
      meta: {
        ok: true,
        url,
        textLength: text.length,
        wordCount: countWords(text),
        fetchedAt: new Date().toISOString(),
      },
      text,
      html,
    };
  } catch (e) {
    return {
      meta: { ok: false, url, textLength: 0, wordCount: 0, fetchedAt: new Date().toISOString(), error: e instanceof Error ? `fetch_error: ${e.message}` : "fetch_error" },
      text: "", html: "",
    };
  }
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function htmlToText(html: string): string {
  // Cheap and cheerful HTML-to-text. Keeps headings on their own lines so
  // the quality scorer can parse them.
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<\/?(h[1-6])([^>]*)>/gi, "\n\n")
    .replace(/<\/?(p|div|li|br)([^>]*)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
