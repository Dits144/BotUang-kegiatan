import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BotUang Dashboard",
    template: "%s - BotUang",
  },
  description:
    "Modern dashboard for WhatsApp group finance, activities, reminders, and custom commands.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "BotUang Dashboard",
    description:
      "Kelola kas dan aktivitas grup WhatsApp dari dashboard fintech yang mobile-first.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" data-theme="dark">
      <body>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
