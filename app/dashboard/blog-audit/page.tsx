import { redirect } from "next/navigation";

// Blog audit was folded into the unified Reports page. Keep this route working
// for old links/bookmarks by sending it to the Audit worklist tab.
export default function BlogAuditPage() {
  redirect("/dashboard/reports?tab=audit");
}
