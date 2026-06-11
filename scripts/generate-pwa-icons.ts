#!/usr/bin/env tsx
// Generates the full PWA icon set + manifest.json for the Astro rebuild from
// the Figma-exported "6o" brand mark (black + red dot, transparent bg).
//
// Source: C:/Users/HP/Downloads/Group 427318959.svg (Figma node 76-2141,
// "Favicon Logo > in Black > Group 427318959", exported 2026-06-02).
//
// Outputs (all in public/):
//   favicon.svg              — vector favicon, modern browsers
//   favicon.ico              — 32×32 PNG-in-ICO container, legacy browsers
//   apple-touch-icon.png     — 180×180, white bg (iOS strips transparency)
//   icon-192.png             — 192×192, white bg, standard PWA
//   icon-512.png             — 512×512, white bg, standard PWA
//   icon-512-maskable.png    — 512×512, mark inside 60% safe zone for
//                              Android adaptive icons (circle crop)
//   manifest.json            — wired to all of the above
//
// Run: npx tsx scripts/generate-pwa-icons.ts

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "C:/Users/HP/Downloads/Group 427318959.svg";
const OUT = "public";

// Mark aspect ratio is ~101:68 (wide). When placing on a square canvas we
// scale by WIDTH and vertically center.
async function markOnSquare(size: number, markWidthFrac: number, bg: string): Promise<Buffer> {
  const markW = Math.round(size * markWidthFrac);
  const svg = readFileSync(SRC);
  const mark = await sharp(svg).resize({ width: markW }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  const left = Math.round((size - (meta.width ?? markW)) / 2);
  const top = Math.round((size - (meta.height ?? markW)) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: mark, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Wrap a PNG buffer in a single-image ICO container (valid since Vista —
// all evergreen browsers + IE9+ accept PNG-compressed ICO entries).
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(1, 4);      // count: 1 image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height
  entry.writeUInt8(0, 2);          // palette
  entry.writeUInt8(0, 3);          // reserved
  entry.writeUInt16LE(1, 4);       // planes
  entry.writeUInt16LE(32, 6);      // bpp
  entry.writeUInt32LE(png.length, 8);           // data size
  entry.writeUInt32LE(6 + 16, 12);              // data offset
  return Buffer.concat([header, entry, png]);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // --- favicon.svg — copy the mark as-is (vector, transparent) ---
  writeFileSync(`${OUT}/favicon.svg`, readFileSync(SRC));
  console.log("✅ favicon.svg");

  // --- favicon.ico — 32×32 on transparent ---
  const fav32 = await markOnSquare(32, 0.85, "#00000000");
  writeFileSync(`${OUT}/favicon.ico`, pngToIco(fav32, 32));
  console.log("✅ favicon.ico (32×32 PNG-in-ICO)");

  // --- apple-touch-icon — 180×180 WHITE bg (iOS renders black behind
  //     transparency, which would make the black mark invisible) ---
  const apple = await markOnSquare(180, 0.72, "#FFFFFF");
  writeFileSync(`${OUT}/apple-touch-icon.png`, apple);
  console.log("✅ apple-touch-icon.png (180×180)");

  // --- standard PWA icons — white bg, mark at 72% width ---
  writeFileSync(`${OUT}/icon-192.png`, await markOnSquare(192, 0.72, "#FFFFFF"));
  writeFileSync(`${OUT}/icon-512.png`, await markOnSquare(512, 0.72, "#FFFFFF"));
  console.log("✅ icon-192.png + icon-512.png");

  // --- maskable — Android circle-crops to the central 80%, so keep the
  //     mark inside 60% width to survive every mask shape ---
  writeFileSync(`${OUT}/icon-512-maskable.png`, await markOnSquare(512, 0.55, "#FFFFFF"));
  console.log("✅ icon-512-maskable.png (60% safe zone)");

  // --- manifest.json ---
  const manifest = {
    name: "We360.ai — Workforce Analytics",
    short_name: "We360.ai",
    description: "Workforce analytics software — track productivity, measure ROI, prevent burnout.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Browser-chrome tint (Android address bar etc.) — brand purple.
    theme_color: "#5B45E0",
    // Splash screen while the PWA boots — white, matches site bg.
    background_color: "#FFFFFF",
    lang: "en-IN",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  console.log("✅ manifest.json");

  console.log("\nAdd to the Astro root layout <head>:");
  console.log(`  <link rel="icon" href="/favicon.ico" sizes="32x32">`);
  console.log(`  <link rel="icon" href="/favicon.svg" type="image/svg+xml">`);
  console.log(`  <link rel="apple-touch-icon" href="/apple-touch-icon.png">`);
  console.log(`  <link rel="manifest" href="/manifest.json">`);
  console.log(`  <meta name="theme-color" content="#5B45E0">`);
}

main().catch((e) => { console.error(e); process.exit(1); });
