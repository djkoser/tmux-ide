import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

// Title is set client-side per route (see app/page.tsx and
// app/directory/[name]/DirectoryPage.tsx). A static metadata title would win the
// one-time hydration race and overwrite the workspace-aware title, so it is
// intentionally omitted here.
export const metadata: Metadata = {
  description: "Command center for tmux-ide",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexMono.variable} suppressHydrationWarning>
      <body
        className="min-h-screen bg-[var(--bg)] text-[var(--fg)] antialiased text-[13px] leading-[1.5]"
        style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
      >
        <Providers>
          <TopBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
