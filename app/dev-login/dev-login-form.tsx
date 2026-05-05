"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { devLoginAction } from "./actions";

export function DevLoginForm() {
  const [email, setEmail] = useState("lawrance.bamania@we360.ai");
  const [name, setName] = useState("Lawrance Bamania");
  const [role, setRole] = useState<"member" | "admin" | "super_admin">("super_admin");
  const [platformAdmin, setPlatformAdmin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("name", name);
    fd.set("role", role);
    if (platformAdmin) fd.set("platform_admin", "on");

    start(async () => {
      const result = await devLoginAction(fd);
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <div className="min-h-svh bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 bg-white rounded-xl border border-[#E5E7EB] p-8 shadow-sm">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-semibold text-[#FEB800] bg-[#FEB800]/15 px-2 py-0.5 rounded-md">
            Dev only
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#231D4F]">Dev login</h1>
          <p className="text-sm text-[#7E8492]">
            Bypass Google OAuth while developing. This route returns 404 outside
            <code className="px-1 mx-1 rounded bg-[#F0ECFF] text-[#5B45E0] text-[11px]">NODE_ENV=development</code>.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (@we360.ai)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@we360.ai"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Profile role</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "admin" | "super_admin")}
              className="flex h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 text-sm text-[#231D4F] focus:border-[#7B62FF] focus:outline-none focus:ring-2 focus:ring-[#7B62FF]/20"
            >
              <option value="super_admin">super_admin</option>
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#231D4F] cursor-pointer">
            <Checkbox
              checked={platformAdmin}
              onCheckedChange={(v) => setPlatformAdmin(v === true)}
            />
            Platform admin (can see <code className="text-[11px] px-1 bg-[#F0ECFF] text-[#5B45E0] rounded">/admin</code>)
          </label>

          <Button
            type="submit"
            variant="default"
            className="w-full h-11 rounded-md text-sm font-semibold"
            disabled={pending || !email}
          >
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Sign in to dashboard
          </Button>
        </form>

        <p className="text-[11px] text-[#7E8492] border-t border-[#E5E7EB] pt-4">
          This creates (or updates) a Supabase user with a known dev password,
          then signs you in. Use real Google OAuth for anything else.
        </p>
      </div>
    </div>
  );
}
