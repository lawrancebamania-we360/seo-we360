import { redirect } from "next/navigation";

// Backward-compat redirect for any stale link or cached tab that still points
// at /articles/... — the real routes live under /dashboard/articles/...
// Preserves the dynamic segments + query string.
export default async function ArticlesCompatRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug = [] } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x);
  }
  const target = `/dashboard/articles${slug.length > 0 ? "/" + slug.join("/") : ""}` +
    (qs.toString() ? `?${qs}` : "");
  redirect(target);
}
