import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Schibsted_Grotesk } from "next/font/google";
import { appearanceInitScript } from "@/lib/appearance";
import Aquarium from "@/components/Aquarium";
import "./globals.css";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Regnskap",
  // Opened from the home screen it runs without Safari's chrome. "default"
  // keeps the status bar opaque: "black-translucent" would always draw it in
  // white text, invisible over the light theme.
  appleWebApp: { capable: true, title: "Regnskap", statusBarStyle: "default" },
};

// viewport-fit=cover lets the page run behind the home indicator, which is
// what makes env(safe-area-inset-*) non-zero — the bottom tab bar already pads
// itself by it, and .shell keeps clear of the notch in landscape.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

// Runs before paint so the saved (or OS-preferred) theme, and the saved style
// and accent, apply without a flash.
const themeInitScript = `(function(){try{var stored=localStorage.getItem("budget-theme");var theme=stored==="dark"||stored==="light"?stored:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="light";}})();`;

// The nonce proxy.ts put in this request's CSP; without it the browser refuses
// the pre-paint script below.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="no" suppressHydrationWarning className={sans.variable}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript + appearanceInitScript }} />
      </head>
      <body>
        <div className="bg-ambient" aria-hidden="true">
          <Aquarium />
        </div>
        {children}
      </body>
    </html>
  );
}
