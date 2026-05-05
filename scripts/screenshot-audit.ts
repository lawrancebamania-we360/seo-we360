/**
 * SEO · we360.ai visual-audit screenshot runner.
 *
 * Starts a headless Chromium, drives it through the public + authed pages of
 * the app across mobile / tablet / desktop viewports, and saves the screenshots
 * to /visual-audit/<page>/<viewport>.png for review.
 *
 * Assumes the dev server is already running on http://localhost:3000.
 *
 *   node --loader tsx scripts/screenshot-audit.ts
 *   OR
 *   npx tsx scripts/screenshot-audit.ts
 *
 * Public pages shoot unauthenticated. Authed pages require a valid Supabase
 * session cookie — set SEO_WE360_TEST_COOKIE to the sb-<project>-auth-token
 * value from an existing browser session before running.
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SEO_WE360_BASE ?? "http://localhost:3000";
const AUTH_COOKIE = process.env.SEO_WE360_TEST_COOKIE ?? "";
const OUT_DIR = path.resolve(process.cwd(), "visual-audit");

const VIEWPORTS = [
  { name: "mobile",  width: 390,  height: 844 },   // iPhone 14 Pro
  { name: "tablet",  width: 820,  height: 1180 },  // iPad Air
  { name: "desktop", width: 1440, height: 900 },   // 14" laptop
];

const PAGES_PUBLIC = [
  { slug: "landing",          url: "/" },
  { slug: "login",            url: "/login" },
  { slug: "signup",           url: "/signup" },
  { slug: "forgot-password",  url: "/forgot-password" },
  { slug: "privacy",          url: "/privacy" },
  { slug: "terms",            url: "/terms" },
  { slug: "security",         url: "/security" },
];

const PAGES_AUTHED = [
  { slug: "dashboard-overview", url: "/dashboard/overview" },
  { slug: "dashboard-timeline", url: "/dashboard/timeline" },
  { slug: "dashboard-tasks",    url: "/dashboard/tasks" },
  { slug: "dashboard-keywords", url: "/dashboard/keywords" },
  { slug: "dashboard-wins",     url: "/dashboard/wins" },
  { slug: "dashboard-sprint",   url: "/dashboard/sprint" },
  { slug: "dashboard-profile",  url: "/dashboard/profile" },
  { slug: "admin-overview",     url: "/admin" },
  { slug: "admin-users",        url: "/admin/users" },
];

async function ensureDir(p: string) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function shoot(page: Page, slug: string, viewportName: string) {
  const outDir = path.join(OUT_DIR, slug);
  await ensureDir(outDir);
  const filePath = path.join(outDir, `${viewportName}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  // Small summary file: elements with horizontal scroll are a common layout bug
  const overflow = await page.evaluate(() => {
    const w = window.innerWidth;
    const offenders: Array<{ tag: string; cls: string; w: number }> = [];
    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (el.scrollWidth > w + 1 && el.offsetWidth > 0) {
        offenders.push({ tag: el.tagName, cls: el.className.toString().slice(0, 60), w: el.scrollWidth });
      }
    });
    return offenders.slice(0, 5);
  });
  if (overflow.length > 0) {
    await writeFile(
      path.join(outDir, `${viewportName}.overflow.json`),
      JSON.stringify(overflow, null, 2)
    );
  }
  process.stdout.write(`   · ${viewportName.padEnd(8)} ${overflow.length > 0 ? `(${overflow.length} overflow offenders)` : "ok"}\n`);
}

async function run() {
  console.log(`\nSEO · we360.ai visual audit — base ${BASE}\n`);
  await ensureDir(OUT_DIR);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        userAgent: vp.name === "mobile"
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 We360Audit"
          : vp.name === "tablet"
          ? "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 We360Audit"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 We360Audit",
      });

      // Attach auth cookie if provided — Supabase cookie name looks like sb-<proj>-auth-token
      if (AUTH_COOKIE) {
        const [name, ...rest] = AUTH_COOKIE.split("=");
        if (name && rest.length > 0) {
          await ctx.addCookies([{
            name: name.trim(),
            value: rest.join("=").trim(),
            domain: new URL(BASE).hostname,
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
            secure: BASE.startsWith("https://"),
          }]);
        }
      }

      const page = await ctx.newPage();
      // Short navigation timeout so a broken page doesn't lock the run
      page.setDefaultNavigationTimeout(30_000);

      const pages = [...PAGES_PUBLIC, ...(AUTH_COOKIE ? PAGES_AUTHED : [])];
      console.log(`${vp.name.padEnd(8)} · ${vp.width}×${vp.height}`);
      for (const p of pages) {
        console.log(`  ${p.slug}`);
        try {
          await page.goto(BASE + p.url, { waitUntil: "networkidle", timeout: 30_000 });
          // Let animations settle so screenshots are consistent
          await page.waitForTimeout(700);
          await shoot(page, p.slug, vp.name);
        } catch (e) {
          console.log(`   · ${vp.name.padEnd(8)} FAILED: ${e instanceof Error ? e.message : e}`);
          await writeFile(
            path.join(OUT_DIR, p.slug, `${vp.name}.error.txt`),
            String(e)
          ).catch(() => {/* ignore */});
        }
      }
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close();
  }
  console.log(`\nDone. Screenshots at ${OUT_DIR}\n`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
