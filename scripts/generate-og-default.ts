#!/usr/bin/env tsx
// Generates og-default.png (1200×630) for we360.ai — the fallback OG image
// used when a page doesn't define its own. Brand tokens from
// BRAND_GUIDELINES.md: dark navy #070127, purple axis #5B45E0/#7B62FF,
// accent yellow #FEB800, heading #F8FAFC on dark.
//
// Run: npx tsx scripts/generate-og-default.ts
// Output: public/og-default.png (+ a preview copy at repo root)

import sharp from "sharp";
import { mkdirSync } from "node:fs";

const W = 1200;
const H = 630;

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Brand gradient: purple → light purple → yellow (use once) -->
    <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"  stop-color="#5B45E0"/>
      <stop offset="55%" stop-color="#7B62FF"/>
      <stop offset="100%" stop-color="#FEB800"/>
    </linearGradient>
    <!-- Ambient glow behind the headline -->
    <radialGradient id="glow" cx="22%" cy="38%" r="60%">
      <stop offset="0%"  stop-color="#5B45E0" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#5B45E0" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#070127" stop-opacity="0"/>
    </radialGradient>
    <!-- Subtle card surface for the chart -->
    <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0F0B2E"/>
      <stop offset="100%" stop-color="#191127"/>
    </linearGradient>
  </defs>

  <!-- Background: dark navy -->
  <rect width="${W}" height="${H}" fill="#070127"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Dot grid texture, top-right quadrant -->
  ${Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 14 }, (_, c) =>
      `<circle cx="${720 + c * 36}" cy="${64 + r * 36}" r="2.2" fill="#7B62FF" opacity="0.18"/>`
    ).join("")
  ).join("")}

  <!-- Brand gradient bar (top edge) -->
  <rect x="0" y="0" width="${W}" height="10" fill="url(#brand)"/>

  <!-- Wordmark: we360.ai -->
  <text x="84" y="118" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="44" fill="#F8FAFC" letter-spacing="-1">we360<tspan fill="#FEB800">.</tspan><tspan fill="#7B62FF">ai</tspan></text>

  <!-- Headline -->
  <text x="84" y="300" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="76" fill="#F8FAFC" letter-spacing="-2">Workforce Analytics</text>
  <text x="84" y="384" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="76" fill="url(#brand)" letter-spacing="-2">Software</text>

  <!-- Subline -->
  <text x="84" y="448" font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="30" fill="#9AA0B0">Track productivity. Measure ROI. Prevent burnout.</text>

  <!-- Trust line, bottom-left -->
  <g font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="600">
    <text x="84" y="546" fill="#F8FAFC">120K+ users</text>
    <circle cx="248" cy="538" r="3.5" fill="#FEB800"/>
    <text x="268" y="546" fill="#F8FAFC">10K+ companies</text>
    <circle cx="478" cy="538" r="3.5" fill="#FEB800"/>
    <text x="498" y="546" fill="#F8FAFC">21+ countries</text>
  </g>

  <!-- Abstract dashboard card, right side -->
  <g>
    <rect x="800" y="270" width="320" height="270" rx="18" fill="url(#card)" stroke="#7B62FF" stroke-opacity="0.35" stroke-width="1.5"/>
    <!-- Card header dots -->
    <circle cx="830" cy="300" r="5" fill="#7E8492" opacity="0.6"/>
    <circle cx="850" cy="300" r="5" fill="#7E8492" opacity="0.4"/>
    <circle cx="870" cy="300" r="5" fill="#7E8492" opacity="0.25"/>
    <!-- Chart label line -->
    <rect x="830" y="324" width="120" height="8" rx="4" fill="#7E8492" opacity="0.35"/>
    <!-- Bars (brand sequential palette) -->
    <rect x="838"  y="436" width="36" height="74"  rx="6" fill="#5B45E0"/>
    <rect x="888"  y="404" width="36" height="106" rx="6" fill="#7B62FF"/>
    <rect x="938"  y="452" width="36" height="58"  rx="6" fill="#7E8492" opacity="0.55"/>
    <rect x="988"  y="372" width="36" height="138" rx="6" fill="#7B62FF"/>
    <rect x="1038" y="336" width="36" height="174" rx="6" fill="#FEB800"/>
    <!-- Trend line above bars -->
    <polyline points="856,420 906,388 956,432 1006,352 1056,316" fill="none" stroke="#F8FAFC" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <circle cx="1056" cy="316" r="6" fill="#FEB800" stroke="#F8FAFC" stroke-width="2"/>
  </g>
</svg>`;

async function main() {
  mkdirSync("public", { recursive: true });
  const png = await sharp(Buffer.from(svg))
    .resize(W, H)
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
  await sharp(png).toFile("public/og-default.png");
  const meta = await sharp(png).metadata();
  console.log(`✅ public/og-default.png written — ${meta.width}×${meta.height}, ${(png.length / 1024).toFixed(0)} KB`);
  if ((png.length / 1024) > 200) {
    console.warn("⚠️  Over the 200 KB budget for OG images — increase compression or simplify.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
