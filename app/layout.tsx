import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "How Well Do You Know Me?",
  description: "A playful two-player prediction game"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
