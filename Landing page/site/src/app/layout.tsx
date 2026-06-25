import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ProDex for n8n — Status & Updates | n8n.proday.in",
  description:
    "Track releases for n8n-nodes-prodex. Run OpenAI Codex on your ChatGPT subscription inside self-hosted n8n.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full font-[family-name:var(--font-sans)]">{children}</body>
    </html>
  );
}
