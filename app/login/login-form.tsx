"use client";

import { useSearchParams } from "next/navigation";
import { GoogleButton } from "@/components/auth/google-button";

// Error messages surfaced via the ?error=<code> search param — either from the
// middleware (session_expired, profile_missing) or from the /auth/callback
// domain guard when a non-we360 Google account tries to sign in.
const ERROR_MESSAGES: Record<string, string> = {
  profile_missing:
    "We couldn't find your profile. Sign in again — if this keeps happening, your account may not have been fully created.",
  session_expired: "Your session expired. Sign in again to pick up where you left off.",
  account_deleted: "Your account has been permanently deleted.",
  domain_not_allowed:
    "Only @we360.ai Google accounts can sign in. Please use your we360.ai work email.",
  oauth_failed: "Google sign-in failed. Try again.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard/overview";
  const errorCode = searchParams.get("error");
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? errorCode : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-[#231D4F] dark:text-white">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Internal SEO dashboard · sign in with your @we360.ai Google account.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {errorMessage}
        </div>
      )}

      <GoogleButton next={next} />

      <p className="text-center text-xs text-muted-foreground">
        Only @we360.ai accounts are allowed. Contact IT if you need access.
      </p>
    </div>
  );
}
