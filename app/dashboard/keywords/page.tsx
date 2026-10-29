import { getUserContext } from "@/lib/auth/get-user";
import { getKeywords } from "@/lib/data/keywords";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { KeywordUpload } from "@/components/sections/keyword-upload";
import { KeywordsTable } from "@/components/sections/keywords-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Keywords" };

export default async function KeywordsPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const keywords = await getKeywords(ctx.activeProject.id);
  const canManage = ctx.canManageTeam;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1400px] w-full mx-auto">
      <PageHeader
        title="Keywords"
        description="Tracked keywords with rank, cluster, and competition. Sources: Apify (Mondays), GKP upload, manual."
      />

      <Tabs defaultValue="tracked">
        <TabsList>
          <TabsTrigger value="tracked">Tracked ({keywords.length})</TabsTrigger>
          <TabsTrigger value="upload">Upload from GKP</TabsTrigger>
        </TabsList>
        <TabsContent value="tracked" className="mt-4">
          {keywords.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
              No keywords yet — upload from GKP or wait for Monday&apos;s Apify discovery.
            </div>
          ) : (
            <KeywordsTable keywords={keywords} canManage={canManage} />
          )}
        </TabsContent>
        <TabsContent value="upload" className="mt-4">
          <KeywordUpload projectId={ctx.activeProject.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
