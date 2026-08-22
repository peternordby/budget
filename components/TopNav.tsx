"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "./TopNav.module.css";

type TopNavProps = {
  email?: string | null;
};

const ROUTES = [
  { href: "/oversikt", label: "Oversikt" },
  { href: "/transaksjoner", label: "Transaksjoner" },
  { href: "/innsikt", label: "Innsikt" },
];

export default function TopNav({ email }: TopNavProps) {
  const emailLabel = email ?? "Logget inn";
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
            {route.label}
          </Link>
        ))}
      </div>
      <div className="nav-links">
        <div className="nav-meta">
          <span className="user-chip" title={emailLabel}>
            {emailLabel}
          </span>
          <ThemeToggle />
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => supabase.auth.signOut()}
        >
          Logg ut
        </button>
      </div>
    </nav>
  );
}
