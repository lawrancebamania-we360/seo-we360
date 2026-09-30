import { getUserContext } from "@/lib/auth/get-user";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewCategoryForm } from "@/components/sections/ai-visibility/new-category-form";

export const metadata = { title: "New category · AI Visibility" };

// Ticket 4: the self-serve "add a category" entry point. Deliberately a
// single-step form (name + optional description) rather than a multi-step
// wizard pre-selecting personas/topics - once created, the category lands on
// the exact same page every other category uses, which already has full
// persona review and prompt add/generate/import. A wizard duplicating that
// setup inline would just be the same steps twice.
export default async function NewAiVisibilityCategoryPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-2xl w-full mx-auto">
      <PageHeader
        title="New AI Visibility category"
        description="Track a new product or service line independently - its own buyer prompts, its own citation score, its own report. Personas and prompts are set up on the category's own page right after you create it."
      />
      <NewCategoryForm projectId={ctx.activeProject.id} />
    </div>
  );
}
