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

  return (
    <nav className="nav">
      <div className="brand">Regnskap</div>
      <div className="nav-links">
        <Link className={`nav-link ${isInsertActive ? "active" : ""}`} href="/">
          Legg til
        </Link>
        <Link
          className={`nav-link ${pathname === "/visualize" ? "active" : ""}`}
          href="/visualize"
        >
          Oversikt
        </Link>
        <span className="user-chip">{email ?? "Signed in"}</span>
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
