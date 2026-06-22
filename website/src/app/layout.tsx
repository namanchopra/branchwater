import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/constants";
import { PREPAINT_THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });

const TITLE = "Branchwater — git for your local databases";
const DESCRIPTION =
  "Snapshot every local database on your machine as one logical branch. Experiment, diff what changed, and roll back to any commit — the git workflow you already know, for the data you develop against. Engine-agnostic, 100% local, MIT-licensed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Branchwater",
  keywords: [
    "database version control",
    "postgres",
    "snapshot",
    "branch",
    "database branching",
    "pg_dump alternative",
    "local development",
    "dev tools",
    "CLI",
    "local-first",
    "open source",
  ],
  authors: [{ name: "Branchwater" }],
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: SITE_URL, siteName: "Branchwater" },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "git for your local databases — snapshot, branch, diff, and roll back. Engine-agnostic, 100% local.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080b10" },
    { media: "(prefers-color-scheme: light)", color: "#f3f6f9" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
        {/* Pre-paint theme application to avoid a light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_THEME_SCRIPT }} />
        {/* If JS is unavailable, never leave reveal-animated content hidden. */}
        <noscript>
          <style>{`.reveal{opacity:1 !important;transform:none !important}.tline{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
