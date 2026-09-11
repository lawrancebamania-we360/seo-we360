import { AiVisibilityCategoryPage } from "../_page-content";
import { RememberCategory } from "../_remember-category";

export const metadata = { title: "Workforce Analytics · AI Visibility" };

export default async function Page() {
  return (
    <>
      <RememberCategory category="workforce_analytics" />
      <AiVisibilityCategoryPage category="workforce_analytics" />
    </>
  );
}
