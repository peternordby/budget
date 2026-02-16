import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regnskap",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="no">
      <body>
        <div className="bg-ambient" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
