"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage("Email and password are required.");
      return;
    }

    setPending(true);
    const result = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (result.error) {
      setMessage(result.error.message);
    }

    setPending(false);
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
              placeholder="you@example.com"
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
          </div>
          {message ? <span className="status">{message}</span> : null}
        </form>
      </div>
    </div>
  );
}
