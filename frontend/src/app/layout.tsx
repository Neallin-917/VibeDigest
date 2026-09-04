import type { Metadata } from "next";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeDigest",
  description: "AI-powered video summarization and chat",
};

export default async function RootLayout({
  children,
  auth,
}: Readonly<{
  children: React.ReactNode;
  auth: React.ReactNode;
}>) {
  const requestLocale = (await headers()).get("x-vd-locale");
  const locale = isLocale(requestLocale) ? requestLocale : DEFAULT_LOCALE;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        {auth}
      </body>
    </html>
  );
}
