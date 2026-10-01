import type { Metadata } from "next";
import { DashboardPage } from "../../components/dashboard-page";

export const metadata: Metadata = {
  title: "Kas Anggota",
};

export default function Page() {
  return <DashboardPage section="participants" />;
}
