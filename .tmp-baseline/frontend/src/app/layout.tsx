import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeDigest",
  description: "AI-powered video summarization and chat",
};

/**
 * Root layout — kept minimal since the real HTML shell is in [lang]/layout.tsx.
 * Fonts, analytics, and structured data are handled by the locale-specific layout.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
