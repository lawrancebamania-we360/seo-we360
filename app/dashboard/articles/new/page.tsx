import { getUserContext } from "@/lib/auth/get-user";
import { getProjectKeywords } from "@/lib/data/articles";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { NewArticleForm } from "./new-form";

export const metadata = { title: "New article" };

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ keywordId?: string; keyword?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const [keywords, params] = await Promise.all([
    getProjectKeywords(ctx.activeProject.id),
    searchParams,
  ]);

  return (
    <div className="flex-1 px-6 py-8 lg:px-10 max-w-[1100px] w-full mx-auto">
      <NewArticleForm
        projectId={ctx.activeProject.id}
        keywords={keywords}
        initialKeywordId={params.keywordId}
        initialKeyword={params.keyword}
      />
    </div>
  );
}
