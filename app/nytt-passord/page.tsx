"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// The landing page for both a password-reset link and a dashboard invite —
// the two differ only in which email template sent them, and in both cases
// the user ends up here to choose a password.
//
// Two link shapes reach this page, and it accepts either:
//
//   ?token_hash=...&type=recovery|invite
//       The template built its own link from {{ .TokenHash }}. We exchange it
//       for a session with verifyOtp. This is the robust shape: no session
//       lands in a URL fragment, and nothing depends on that fragment
//       surviving a redirect.
//   #access_token=...
//       The default {{ .ConfirmationURL }}. supabase-js is configured with
//       detectSessionInUrl (the default), so the session is already
//       established by the time this component mounts; there is nothing to do
//       but wait for getSession to report it.
type LinkState = "checking" | "ready" | "invalid";

function NyttPassordForm() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    async function establishSession() {
      // Read the query directly rather than through useSearchParams: the hash
      // form carries nothing here, and this runs once on mount either way.
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (!active) return;
        if (error) {
          setLinkState("invalid");
          setMessage(error.message);
          return;
        }
        setLinkState("ready");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setLinkState(data.session ? "ready" : "invalid");
    }

    establishSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 6) {
      setMessage("Passordet må være minst 6 tegn.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passordene er ikke like.");
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setPending(false);
      return;
    }
    setDone(true);
    setPending(false);
    // The link already signed them in, so there is nowhere to send them but
    // into the app.
    router.replace("/oversikt");
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <span className="badge">Regnskap</span>
        <h1>Sett nytt passord</h1>

        {linkState === "checking" ? (
          <p className="helper">Sjekker lenken...</p>
        ) : linkState === "invalid" ? (
          <>
            <p>
              Lenken er ugyldig eller utløpt. Reset-lenker kan bare brukes én
              gang, og de varer ikke evig.
            </p>
            {message ? <span className="status">{message}</span> : null}
            <Link className="btn btn-primary" href="/glemt-passord">
              Send en ny lenke
            </Link>
          </>
        ) : done ? (
          <p>Passordet er endret. Sender deg videre...</p>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="new-password">nytt passord</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">gjenta passord</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending ? "Lagrer..." : "Lagre passord"}
              </button>
            </div>
            {message ? <span className="status">{message}</span> : null}
          </form>
        )}
      </div>
    </div>
  );
}

export default function NyttPassordPage() {
  return (
    <Suspense fallback={null}>
      <NyttPassordForm />
    </Suspense>
  );
}
