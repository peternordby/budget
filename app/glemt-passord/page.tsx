"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function GlemtPassordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage("E-post er påkrevd.");
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/nytt-passord`,
    });

    if (error) {
      setMessage(error.message);
    } else {
      // Deliberately the same confirmation whether or not the address has an
      // account: a different message would turn this form into a way to test
      // whether someone is a user here.
      setSent(true);
    }
    setPending(false);
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <span className="badge">Regnskap</span>
        <h1>Glemt passord</h1>
        {sent ? (
          <>
            <p>
              Hvis <strong>{email.trim()}</strong> har en konto, ligger det nå en
              lenke for å sette nytt passord i innboksen.
            </p>
            <Link className="btn btn-ghost" href="/logg-inn">
              Til innlogging
            </Link>
          </>
        ) : (
          <>
            <p>Skriv inn e-posten din, så sender vi en lenke for å sette nytt passord.</p>
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="reset-email">e-post</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="navn@eksempel.no"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  {pending ? "Sender..." : "Send lenke"}
                </button>
                <Link className="btn btn-ghost" href="/logg-inn">
                  Avbryt
                </Link>
              </div>
              {message ? <span className="status">{message}</span> : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
