import type { Metadata } from "next";
import { ConnectPage } from "../components/connect-page";

export const metadata: Metadata = {
  title: "Connect",
};

export default function Page() {
  return <ConnectPage />;
}
