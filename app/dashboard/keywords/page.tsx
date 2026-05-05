import Link from "next/link";
import { getUserContext } from "@/lib/auth/get-user";
import { getKeywords } from "@/lib/data/keywords";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { KeywordUpload } from "@/components/sections/keyword-upload";
import { KeywordRowActions } from "@/components/sections/keyword-row-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PenLine, ArrowUp, ArrowDown, Minus, Sparkle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { competitionColor, formatNumber, trendColor } from "@/lib/ui-helpers";

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
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">KD</TableHead>
                    <TableHead>Competition</TableHead>
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keywords.map((k) => (
                    <TableRow key={k.id} className="hover:bg-muted/40">
                      <TableCell className="font-medium">
                        <div>{k.keyword}</div>
                        {k.intent && (
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.intent}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{k.cluster ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(k.search_volume)}</TableCell>
                      <TableCell className="text-right tabular-nums">{k.kd ?? "—"}</TableCell>
                      <TableCell>
                        {k.competition && (
                          <Badge variant="outline" className={cn("font-medium", competitionColor(k.competition))}>
                            {k.competition.replace(" Competition", "")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {k.current_rank ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{k.target_rank ?? "—"}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", trendColor(k.trend))}>
                          {k.trend === "up" && <ArrowUp className="size-3" />}
                          {k.trend === "down" && <ArrowDown className="size-3" />}
                          {k.trend === "stable" && <Minus className="size-3" />}
                          {k.trend === "new" && <Sparkle className="size-3" />}
                          {k.trend}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="xs"
                            render={
                              <Link href={`/dashboard/articles/new?keyword=${encodeURIComponent(k.keyword)}&keywordId=${k.id}`} />
                            }
                          >
                            <PenLine className="size-3" />
                            Write
                          </Button>
                          {canManage && (
                            <KeywordRowActions keywordId={k.id} keyword={k.keyword} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="upload" className="mt-4">
          <KeywordUpload projectId={ctx.activeProject.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
