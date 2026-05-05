import type { Skill, Finding } from "./types";

// LocalBusiness + NAP checks — most useful for location pages / homepage
export const localSkill: Skill = {
  name: "local",
  description: "Local SEO signals: LocalBusiness schema, NAP consistency, address presence",
  pillars: ["GEO", "SEO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const path = new URL(url).pathname;

    const isLocationPage = /\/location|\/dumka|\/narnaul|\/jamshedpur|\/mysore|\/near/.test(path) ||
                           path === "/" ||
                           /\/contact|\/visit/.test(path);

    if (!isLocationPage) return findings; // not applicable

    const bodyText = $("body").text();
    const hasAddress = /\d{6}|\bpin\s*code\b|\baddress\b|\bstreet\b/i.test(bodyText);
    const hasPhone = /\+?\d[\d\s-]{8,}/.test(bodyText);

    const jsonld = $("script[type='application/ld+json']").toArray();
    let hasLocalBusiness = false;
    for (const el of jsonld) {
      try {
        const text = $(el).text();
        if (/LocalBusiness|SportsActivityLocation|Restaurant|Store|TravelAgency/.test(text)) {
          hasLocalBusiness = true;
          break;
        }
      } catch { /* ignore */ }
    }

    if (!hasLocalBusiness) {
      findings.push({
        skill: "local",
        check: "localbusiness_schema",
        status: "missing",
        pillar: "GEO",
        priority: "high",
        message: "Location page missing LocalBusiness schema",
        impl: "Add LocalBusiness JSON-LD with name, address, geo coordinates, openingHours, telephone — required for map-pack ranking.",
      });
    }

    if (!hasAddress) {
      findings.push({
        skill: "local",
        check: "address_presence",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: "Page text doesn't mention an address or pincode",
        impl: "Add the full street address visibly on the page — and ensure it matches GBP + citations (NAP consistency).",
      });
    }

    if (!hasPhone) {
      findings.push({
        skill: "local",
        check: "phone_presence",
        status: "warn",
        pillar: "SEO",
        priority: "low",
        message: "No phone number visible on page",
        impl: "Add a clickable tel: link — reduces bounce, helps local ranking.",
      });
    }

    return findings;
  },
};
