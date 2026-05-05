"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  userId: string;
  email: string;
  platformAdmin: boolean;
}

export function UserAdminActions({ userId, email, platformAdmin }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const toggle = () => {
    if (!confirm(`${platformAdmin ? "Revoke" : "Grant"} platform admin for ${email}?`)) return;
    start(async () => {
      const t = toast.loading(platformAdmin ? "Revoking..." : "Granting...");
      try {
        const res = await fetch(`/api/admin/users/${userId}/platform-admin`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform_admin: !platformAdmin }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        toast.success(platformAdmin ? "Admin access revoked" : "Admin access granted", { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  };

  return (
    <Button variant="ghost" size="xs" onClick={toggle} disabled={pending} className="text-xs">
      {pending ? <Loader2 className="size-3 animate-spin" /> :
        platformAdmin ? <ShieldOff className="size-3" /> : <ShieldCheck className="size-3" />}
      {platformAdmin ? "Revoke" : "Grant admin"}
    </Button>
  );
}
