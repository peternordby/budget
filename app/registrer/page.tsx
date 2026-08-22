"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RegistrerPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage("E-post og passord er påkrevd.");
      return;
    }
    // Supabase's own minimum. Checking it here turns a round trip and an
    // English error message into an immediate Norwegian one.
    if (password.length < 6) {
      setMessage("Passordet må være minst 6 tegn.");
      return;
    }

    setPending(true);
    // window.location.origin rather than an env var: correct on localhost and
    // on budget.nordby.dev without either being configured. Both still have to
    // be on the redirect allow list in the Supabase dashboard.
    const { error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: `${window.location.origin}/logg-inn` },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setSent(true);
    }
    setPending(false);
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <span className="badge">Regnskap</span>
        <h1>Opprett konto</h1>
        {sent ? (
          <>
            <p>
              Sjekk e-posten din. Vi har sendt en bekreftelseslenke til{" "}
              <strong>{email.trim()}</strong> — følg den for å aktivere kontoen.
            </p>
            <p className="helper">
              Kontoen starter med et sett standardkategorier du kan endre på
              budsjettsiden.
            </p>
            <Link className="btn btn-ghost" href="/logg-inn">
              Til innlogging
            </Link>
          </>
        ) : (
          <>
            <p>Registrer deg for å begynne å føre regnskap.</p>
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="signup-email">e-post</label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="navn@eksempel.no"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="signup-password">passord</label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  {pending ? "Oppretter..." : "Opprett konto"}
                </button>
              </div>
              {message ? <span className="status">{message}</span> : null}
            </form>
            <p className="helper">
              Har du konto allerede? <Link href="/logg-inn">Logg inn</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
