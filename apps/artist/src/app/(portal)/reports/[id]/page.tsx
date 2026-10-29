import { PinReportView } from "~/features/reports/pin-report-view";

export const metadata = { title: "Pin report" };

export default async function PinReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PinReportView pinId={id} />;
}
