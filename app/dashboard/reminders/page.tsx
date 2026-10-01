import type { Metadata } from "next";
import { DashboardPage } from "../../components/dashboard-page";

export const metadata: Metadata = {
  title: "Reminders",
};

export default function Page() {
  return <DashboardPage section="reminders" />;
}
