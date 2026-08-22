"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";


type AuthGateProps = {
  children: (session: Session) => ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
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

  // Redirect in an effect rather than during render: router.replace during
  // render is a React state update on another component, and `loading` has to
  // resolve first or a signed-in reload would bounce to the login screen
  // before getSession has answered.
  useEffect(() => {
    if (!hasSupabaseEnv || loading || session) return;
    router.replace("/logg-inn");
  }, [loading, session, router]);

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
    // The login form lives at its own route rather than inline here, so there
    // is one login surface rather than two — /logg-inn is also where the
    // signup and reset links point back to.
    return (
      <main className="shell">
        <div className="card">Sender deg til innlogging...</div>
      </main>
    );
  }

  return <>{children(session)}</>;
}
