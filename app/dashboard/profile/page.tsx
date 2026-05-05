import { getUserContext } from "@/lib/auth/get-user";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await getUserContext();

  return (
    <div className="flex-1 px-6 py-8 lg:px-10 max-w-[800px] w-full mx-auto space-y-6">
      <PageHeader
        title="Profile & security"
        description="Your details, password, and AI provider preferences."
      />
      <ProfileForm profile={ctx.profile} />
    </div>
  );
}
