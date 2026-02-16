"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";
import AuthPanel from "@/components/AuthPanel";

type AuthGateProps = {
  children: (session: Session) => ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, updated) => {
      setSession(updated);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!hasSupabaseEnv) {
    return (
      <main className="shell">
        <div className="card">
          <h1 className="section-title">Mangler Supabase-oppsett</h1>
          <p className="helper">
            Sett `NEXT_PUBLIC_SUPABASE_URL` og
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` i `.env.local`.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="card">Laster inn sesjonen din...</div>
      </main>
    );
  }

  if (!session) {
    return <AuthPanel />;
  }

  return <>{children(session)}</>;
}
