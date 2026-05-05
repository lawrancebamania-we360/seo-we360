import type { Skill, Finding } from "./types";

export const imagesSkill: Skill = {
  name: "images",
  description: "Image optimization: alt text, modern formats, lazy loading, width/height",
  pillars: ["SEO", "SXO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $ } = ctx;

    const imgs = $("img").toArray();
    if (imgs.length === 0) return findings;

    let missingAlt = 0;
    let noLazy = 0;
    let noDims = 0;
    let legacyFormat = 0;
    const heavyImages: string[] = [];

    for (const el of imgs) {
      const $img = $(el);
      const src = $img.attr("src") ?? $img.attr("data-src") ?? "";
      const alt = $img.attr("alt");
      const loading = $img.attr("loading");
      const width = $img.attr("width");
      const height = $img.attr("height");

      if (alt === undefined) missingAlt++;
      if (loading !== "lazy" && !$img.is(":first-of-type")) noLazy++;
      if (!width || !height) noDims++;
      if (/\.(jpe?g|png|gif)(\?|$)/i.test(src) && !/\.webp|\.avif/i.test(src)) legacyFormat++;
      if (src && /hero|banner|cover/i.test(src)) heavyImages.push(src);
    }

    if (missingAlt > 0) {
      findings.push({
        skill: "images",
        check: "alt_text",
        status: missingAlt > 5 ? "fail" : "warn",
        pillar: "SEO",
        priority: missingAlt > 10 ? "high" : "medium",
        message: `${missingAlt} image${missingAlt === 1 ? "" : "s"} missing alt text`,
        impl: "Add descriptive alt text — boosts accessibility, image SEO, and AI ingestion.",
        details: { missing_alt_count: missingAlt, total_images: imgs.length },
      });
    }

    if (noLazy > 3) {
      findings.push({
        skill: "images",
        check: "lazy_loading",
        status: "warn",
        pillar: "SXO",
        priority: "medium",
        message: `${noLazy} below-the-fold images not lazy-loaded`,
        impl: `Add loading="lazy" to images below the fold — improves LCP.`,
        details: { no_lazy_count: noLazy },
      });
    }

    if (noDims > 2) {
      findings.push({
        skill: "images",
        check: "dimensions",
        status: "warn",
        pillar: "SXO",
        priority: "medium",
        message: `${noDims} images without explicit width/height`,
        impl: "Set width/height attributes — prevents layout shift (CLS).",
        details: { no_dims_count: noDims },
      });
    }

    if (legacyFormat > 3) {
      findings.push({
        skill: "images",
        check: "format",
        status: "warn",
        pillar: "SXO",
        priority: "low",
        message: `${legacyFormat} images in legacy formats (JPG/PNG/GIF)`,
        impl: "Convert to WebP or AVIF — 25–50% smaller with the same quality.",
        details: { legacy_count: legacyFormat },
      });
    }

    return findings;
  },
};
