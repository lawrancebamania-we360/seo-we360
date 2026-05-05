import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Brand pair: Poppins (UI / headings / body) + JetBrains Mono (numbers, IDs, code).
// Poppins is the we360.ai brand sans — geometric, friendly, professional.
// JetBrains Mono is the monospace counterpart used for tabular numbers,
// keyword IDs, and code blocks in the SEO dashboard.
const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SEO · we360.ai",
    template: "%s · SEO · we360.ai",
  },
  description:
    "Internal SEO command dashboard for the we360.ai team — 5-pillar optimization: SEO, AEO, GEO, SXO, AIO.",
  applicationName: "SEO · we360.ai",
  authors: [{ name: "we360.ai" }],
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <NextTopLoader
          color="#5B45E0"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #5B45E0,0 0 5px #7B62FF"
          zIndex={1600}
        />
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
