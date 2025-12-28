import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Regnskap",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="no" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
