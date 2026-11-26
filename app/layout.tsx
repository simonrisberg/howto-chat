import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HOWTO Chat",
  description: "Ask questions about the team's HOWTO documents",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
