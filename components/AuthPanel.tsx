"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";
import { hasEncryption, unlockWithPassword, type EncMeta } from "@/lib/crypto";

export default function AuthPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Someone who is already signed in has no business on the login screen —
  // typically a bookmark, or the back button after logging in.
  useEffect(() => {
    if (!hasSupabaseEnv) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/oversikt");
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage("E-post og passord er påkrevd.");
      return;
    }

    setPending(true);
    const result = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (result.error) {
      setMessage(result.error.message);
      setPending(false);
      return;
    }

    // The password is in hand exactly here, so unlock the ledger key now
    // rather than making EncryptionGate ask for the same password one render
    // later. A failure is not worth reporting on this screen: the sign-in did
    // work, and EncryptionGate handles every reason the key would not open
    // (no key yet, or one wrapped under a password since reset).
    const meta = result.data.user?.user_metadata as EncMeta | undefined;
    if (hasEncryption(meta)) {
      await unlockWithPassword(password, meta!, result.data.user!.id).catch(() => {});
    }

    // AuthGate's onAuthStateChange would pick this up on its own, but only
    // once something renders it — and nothing does on this route.
    router.replace("/oversikt");
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <span className="badge">Regnskap</span>
        <h1>Velkommen tilbake</h1>
        <p>Logg inn for å holde utgiftene dine ryddige og søkbare.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">e-post</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="navn@eksempel.no"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">passord</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Laster..." : "Logg inn"}
            </button>
            <Link className="btn btn-ghost" href="/glemt-passord">
              Glemt passord?
            </Link>
          </div>
          {message ? <span className="status">{message}</span> : null}
        </form>
        <p className="helper">
          Har du ikke konto? <Link href="/registrer">Registrer deg</Link>.
        </p>
      </div>
    </div>
  );
}
