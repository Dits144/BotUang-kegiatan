import type { Metadata } from "next";
import { LandingPage } from "./components/landing-page";

export const metadata: Metadata = {
  title: "BotUang Dashboard",
  description:
    "Dashboard WhatsApp financial and activity bot untuk kas grup, transaksi, reminder, dan command otomatis.",
};

export default function Home() {
  return <LandingPage />;
}
