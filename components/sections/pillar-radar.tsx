"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Props {
  scores: Record<string, number>;
}

export function PillarRadar({ scores }: Props) {
  const data = [
    { pillar: "SEO", score: scores.SEO ?? 0, fullMark: 100 },
    { pillar: "AEO", score: scores.AEO ?? 0, fullMark: 100 },
    { pillar: "GEO", score: scores.GEO ?? 0, fullMark: 100 },
    { pillar: "SXO", score: scores.SXO ?? 0, fullMark: 100 },
    { pillar: "AIO", score: scores.AIO ?? 0, fullMark: 100 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Five-pillar snapshot</CardTitle>
          <CardDescription>
            Combined optimization health across SEO, AEO, GEO, SXO, and AIO.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="80%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="pillar" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                stroke="var(--border)"
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.25}
                strokeWidth={2}
                animationDuration={600}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
