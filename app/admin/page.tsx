import { getAdminMetrics } from "@/lib/data/admin-metrics";
import { Card } from "@/components/ui/card";
import { Users, UserPlus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/ui/animated-number";

export const metadata = { title: "Overview · Admin" };

export default async function AdminOverview() {
  const m = await getAdminMetrics();

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px]">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Internal we360.ai SEO dashboard · team metrics.
        </p>
      </div>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Card className="p-4 space-y-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#5B45E0]/10 text-[#5B45E0]">
            <Users className="size-4" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Users
            </div>
            <div className="text-2xl font-bold tabular-nums">
              <AnimatedNumber value={m.users_total} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Active profiles</div>
          </div>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#FEB800]/15 text-[#8a6500]">
            <UserPlus className="size-4" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              New · 30d
            </div>
            <div className="text-2xl font-bold tabular-nums">
              <AnimatedNumber value={m.new_signups_30d} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Recent signups</div>
          </div>
        </Card>
        <Card className="p-5 space-y-3">
          <div className="font-semibold">Browse users</div>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1 text-xs text-[#5B45E0] hover:underline"
          >
            View all users <ArrowRight className="size-3" />
          </Link>
        </Card>
      </section>
    </div>
  );
}
