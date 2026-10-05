import { redirect } from "next/navigation";

// The old manager-only walkthrough URL. Inspections are booked from
// /inspections now (a caretaker or a manager runs them).
export default async function NewConditionReportPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/inspections?new=1&unitId=${encodeURIComponent(id)}`);
}
