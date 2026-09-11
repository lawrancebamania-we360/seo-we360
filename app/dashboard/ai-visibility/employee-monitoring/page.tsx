import { AiVisibilityCategoryPage } from "../_page-content";
import { RememberCategory } from "../_remember-category";

export const metadata = { title: "Employee Monitoring · AI Visibility" };

export default async function Page() {
  return (
    <>
      <RememberCategory category="employee_monitoring" />
      <AiVisibilityCategoryPage category="employee_monitoring" />
    </>
  );
}
