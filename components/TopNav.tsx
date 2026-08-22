"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import { displayName, type ProfileUser } from "@/lib/profile";
import styles from "./TopNav.module.css";

type TopNavProps = {
  user?: ProfileUser | null;
};

// `short` is what the phone's bottom tab bar shows. Four tabs fit their full
// names; the fifth pushed "Transaksjoner" past its share of a 375px screen, so
// the narrow layout gets abbreviations rather than ellipses.
const ROUTES = [
  { href: "/oversikt", label: "Oversikt", short: "Oversikt" },
  { href: "/transaksjoner", label: "Transaksjoner", short: "Trans." },
  { href: "/budsjett", label: "Budsjett", short: "Budsjett" },
  { href: "/innsikt", label: "Innsikt", short: "Innsikt" },
  { href: "/sparing", label: "Sparing", short: "Sparing" },
];

export default function TopNav({ user }: TopNavProps) {
  const name = displayName(user);
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <nav className="nav">
      <div className="brand-stack">
        <span className="brand-kicker">Personlig økonomi</span>
        <div className="brand">Regnskap</div>
      </div>
      <div className={styles["nav-routes"]}>
        {ROUTES.map((route) => (
          <Link
            key={route.href}
            href={`${route.href}${suffix}`}
            className={`${styles["nav-route"]} ${pathname === route.href ? styles["active"] : ""}`}
          >
            <span className={styles["nav-route-full"]}>{route.label}</span>
            <span className={styles["nav-route-short"]}>{route.short}</span>
          </Link>
        ))}
      </div>
      <div className="nav-links">
        <div className="nav-meta">
          {/* The chip is the way into /profil, which is also where signing out
              now lives — a sixth tab would not fit the phone's bottom bar, and
              a profile is not a view of the ledger anyway. */}
          <Link
            className={`user-chip ${styles["user-link"]} ${pathname === "/profil" ? styles["active"] : ""}`}
            href="/profil"
            title={`${name} — profil og innstillinger`}
          >
            <Avatar name={name} />
            <span className={styles["user-name"]}>{name}</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
