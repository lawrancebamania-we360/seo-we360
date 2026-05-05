import { notFound } from "next/navigation";
import { DevLoginForm } from "./dev-login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dev login" };

export default function DevLoginPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <DevLoginForm />;
}
