"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./InnsiktTabs.module.css";

const TABS = [
  { href: "/innsikt/periode", label: "Periode" },
  { href: "/innsikt/trender", label: "Trender" },
  { href: "/innsikt/reiser", label: "Reiser" },
];

/**
 * The Innsikt section's subpages, under the header. Carries the query string
 * like TopNav does, so the period survives a hop to Reiser and back.
 */
export default function InnsiktTabs() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    <nav className={`section-gap ${styles["tabs"]}`} aria-label="Innsikt">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={query ? `${tab.href}?${query}` : tab.href}
          className={`btn btn-small ${pathname === tab.href ? "is-on" : "btn-ghost"}`}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
