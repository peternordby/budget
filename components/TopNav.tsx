"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TopNavProps = {
  email?: string | null;
};

export default function TopNav({ email }: TopNavProps) {
  const pathname = usePathname();
  const isInsertActive = pathname === "/" || pathname === "/insert";
  const emailLabel = email ?? "Logget inn";

  return (
    <nav className="nav">
      <div className="brand-stack">
        <span className="brand-kicker">Personlig økonomi</span>
        <div className="brand">Regnskap</div>
      </div>
      <div className="nav-links">
        <div className="nav-tabs">
          <Link
            className={`nav-link ${isInsertActive ? "active" : ""}`}
            href="/"
          >
            Legg til
          </Link>
          <Link
            className={`nav-link ${pathname === "/visualize" ? "active" : ""}`}
            href="/visualize"
          >
            Oversikt
          </Link>
        </div>
        <span className="user-chip" title={emailLabel}>
          {emailLabel}
        </span>
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
