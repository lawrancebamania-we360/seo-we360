import { notFound } from "next/navigation";
import { getUserContext } from "@/lib/auth/get-user";
import { getCategories } from "@/lib/data/ai-visibility-categories";
import { AiVisibilityCategoryPage } from "../_page-content";
import { RememberCategory } from "../_remember-category";

// Ticket 3: one dynamic route for every SELF-SERVE category, alongside (not
// replacing) the 2 legacy static route files - Next resolves the static
// employee-monitoring/workforce-analytics folders before ever falling
// through to this [categoryKey] segment, so those two keep working exactly
// as before. Any other key is looked up against this project's real
// categories and 404s if it doesn't belong to it (also covers a stale
// bookmark to a category from a different project).
export async function generateMetadata({ params }: { params: Promise<{ categoryKey: string }> }) {
  const { categoryKey } = await params;
  const ctx = await getUserContext();
  const label = ctx.activeProject
    ? (await getCategories(ctx.activeProject.id)).find((c) => c.key === categoryKey)?.label
    : undefined;
  return { title: `${label ?? categoryKey} · AI Visibility` };
}

export default async function CategoryPage({ params }: { params: Promise<{ categoryKey: string }> }) {
  const { categoryKey } = await params;
  const ctx = await getUserContext();
  if (!ctx.activeProject) notFound();

  const categories = await getCategories(ctx.activeProject.id);
  const match = categories.find((c) => c.key === categoryKey);
  if (!match) notFound();

  return (
    <>
      <RememberCategory category={categoryKey} />
      <AiVisibilityCategoryPage category={categoryKey} />
    </>
  );
}
