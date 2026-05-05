import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserContext } from "@/lib/auth/get-user";
import { getArticle } from "@/lib/data/articles";
import { EditArticleForm } from "./edit-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getUserContext();
  const article = await getArticle(id);
  if (!article) notFound();

  return (
    <div className="flex-1 px-6 py-8 lg:px-10 max-w-[1100px] w-full mx-auto space-y-6">
      <Button variant="ghost" size="sm" render={<Link href="/dashboard/articles" />}>
        <ArrowLeft className="size-3.5" />
        Back
      </Button>
      <EditArticleForm article={article} canApprove={ctx.canManageTeam} />
    </div>
  );
}
