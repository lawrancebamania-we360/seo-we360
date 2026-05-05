import { redirect } from "next/navigation";

// /dashboard has no page of its own — always land on the Overview.
export default function DashboardIndex() {
  redirect("/dashboard/overview");
}
