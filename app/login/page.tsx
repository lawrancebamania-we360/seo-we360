import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell mode="signin">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
