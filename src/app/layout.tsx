import type { Metadata } from "next";
import "./globals.css";
import "./accessibility.css";
import "./visual-refresh.css";

export const metadata: Metadata = {
  title: "DigitalShield — Privacy Command Center",
  description: "Manage your digital footprint, identities, exposure findings, and privacy workflows in one secure workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning>{children}</body></html>;
}
