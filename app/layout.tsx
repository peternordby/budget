import type { Metadata } from "next";
import type { ReactNode } from "react";
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
};

// Runs before paint so the saved (or OS-preferred) theme, and the saved style
// and accent, apply without a flash.
const themeInitScript = `(function(){try{var stored=localStorage.getItem("budget-theme");var theme=stored==="dark"||stored==="light"?stored:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="no" suppressHydrationWarning className={sans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript + appearanceInitScript }} />
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
