import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Playtest Inbox · Close the loop",
  description:
    "From bug report to verified fix. Build-aware feedback for indie games.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
