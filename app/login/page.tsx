import type { Metadata } from "next";
import { LoginPage } from "../components/login-page";

export const metadata: Metadata = {
  title: "Login",
};

export default function Page() {
  return <LoginPage />;
}
