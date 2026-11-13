import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegistration from "./pwa";

export const metadata: Metadata = {
  title: "DARA · Household register",
  description:
    "Digital Assisted Recordkeeping for ASHA Workers. A considered space for household visits, clear records, and follow-up care.",
  applicationName: "DARA",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "DARA" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3EFFA" },
    { media: "(prefers-color-scheme: dark)", color: "#F3EFFA" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
