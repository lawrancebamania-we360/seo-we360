"use client";

// Keywords: the tracked-keyword table, split out of the (server) page so it can
// filter client-side with a search box - by keyword, cluster or intent.

import { useState } from "react";
import Link from "next/link";
import { PenLine, ArrowUp, ArrowDown, Minus, Sparkle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchBox, matchesQuery } from "@/components/ui/search-box";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeywordRowActions } from "@/components/sections/keyword-row-actions";
import { cn } from "@/lib/utils";
import { competitionColor, formatNumber, trendColor } from "@/lib/ui-helpers";

export interface KeywordRow {
  id: string;
  keyword: string;
  intent: string | null;
  cluster: string | null;
  search_volume: number | null;
  kd: number | null;
  competition: string | null;
  current_rank: number | null;
  target_rank: number | null;
  trend: string | null;
}

export function KeywordsTable({ keywords, canManage }: { keywords: KeywordRow[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const shown = keywords.filter((k) => matchesQuery(q, k.keyword, k.cluster, k.intent));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <SearchBox value={q} onChange={setQ} placeholder="Search keywords, cluster..." className="w-full sm:w-72" />
      </div>
      {shown.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">No keywords match &ldquo;{q}&rdquo;.</Card>
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
              {shown.map((k) => (
                <TableRow key={k.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <div>{k.keyword}</div>
                    {k.intent && <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.intent}</div>}
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
                  <TableCell className="text-right tabular-nums">{k.current_rank ?? <span className="text-muted-foreground">—</span>}</TableCell>
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
                      <Button variant="ghost" size="xs" render={<Link href={`/dashboard/articles/new?keyword=${encodeURIComponent(k.keyword)}&keywordId=${k.id}`} />}>
                        <PenLine className="size-3" /> Write
                      </Button>
                      {canManage && <KeywordRowActions keywordId={k.id} keyword={k.keyword} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
