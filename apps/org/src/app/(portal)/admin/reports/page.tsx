import { CollectionReportView } from "~/features/reports/collection-report-view";

export const metadata = { title: "Collection reports" };

export default function AdminReportsPage() {
  return <CollectionReportView admin />;
}
