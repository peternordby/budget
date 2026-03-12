"use client";

import { supabase } from "@/lib/supabaseClient";

type TopNavProps = {
  email?: string | null;
};

export default function TopNav({ email }: TopNavProps) {
  const emailLabel = email ?? "Logget inn";

  return (
    <nav className="nav">
      <div className="brand-stack">
        <span className="brand-kicker">Personlig økonomi</span>
        <div className="brand">Regnskap</div>
      </div>
      <div className="nav-links">
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
