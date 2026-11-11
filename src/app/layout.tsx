import type { Metadata } from "next";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TrialPulse", template: "%s · TrialPulse" },
  description: "Reimburse NGO volunteers with receipt evidence, line-level approval, and payouts that leave the rest of the claim open.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
