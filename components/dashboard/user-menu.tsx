"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, KeyRound, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/ui-helpers";
import type { Profile } from "@/lib/types/database";

export function UserMenu({ profile, collapsed = false }: { profile: Profile; collapsed?: boolean }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const roleLabel =
    profile.role === "super_admin" ? "Super Admin"
    : profile.role === "admin" ? "Admin"
    : profile.role === "client" ? "Client"
    : "Member";

  const doSignOut = () => {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        return;
      }
      setConfirmOpen(false);
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(p) =>
            collapsed ? (
              <Button {...p} variant="ghost" size="icon" className="size-9" aria-label="Account">
                <Avatar className="size-7">
                  <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.name} />
                  <AvatarFallback className="text-[10px]">{initials(profile.name)}</AvatarFallback>
                </Avatar>
              </Button>
            ) : (
              <Button {...p} variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-1.5">
                <Avatar className="size-7">
                  <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.name} />
                  <AvatarFallback className="text-[10px]">{initials(profile.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-left">
                  <div className="truncate text-sm font-medium leading-tight">{profile.name}</div>
                  <div className="truncate text-xs text-muted-foreground leading-tight">{roleLabel}</div>
                </div>
              </Button>
            )
          }
        />
        <DropdownMenuContent align={collapsed ? "start" : "end"} side={collapsed ? "right" : "top"} className="w-56">
          <div className="px-2 py-1.5 space-y-0.5">
            <div className="text-sm font-medium">{profile.name}</div>
            <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/dashboard/profile")}>
            <User className="mr-2 size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/dashboard/profile#password")}>
            <KeyRound className="mr-2 size-4" />
            Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/dashboard/integrations")}>
            <Plug className="mr-2 size-4" />
            Integrations
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/30"
          >
            <LogOut className="mr-2 size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={(v) => { if (!pending) setConfirmOpen(v); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <LogOut className="size-4" />
              </div>
              Sign out?
            </DialogTitle>
            <DialogDescription>
              You&apos;ll be returned to the sign-in page. Any unsaved changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={doSignOut}
              disabled={pending}
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogOut className="mr-2 size-4" />}
              {pending ? "Signing out..." : "Yes, sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
