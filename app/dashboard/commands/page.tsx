import type { Metadata } from "next";
import { DashboardPage } from "../../components/dashboard-page";

export const metadata: Metadata = {
  title: "Commands",
};

export default function Page() {
  return <DashboardPage section="commands" />;
}
