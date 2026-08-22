"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import {
  createKeys,
  hasEncryption,
  isUnlocked,
  recoverWithPhrase,
  resumeFromSession,
  unlockWithPassword,
  type EncMeta,
} from "@/lib/crypto";

// The door between a valid session and readable data.
//
// A session is not enough to read this ledger: the amounts and descriptions are
// encrypted under a key derived from the password, and the password is not part
// of the session. Supabase keeps the session in localStorage across browser
// restarts; the key deliberately lives in sessionStorage only, or "the database
// cannot read this" would quietly mean "until someone opens the laptop". So a
// new tab-session asks for the password once. That prompt is the whole UX cost
// of the scheme and there is no way around it.
//
// One component covers every way an account can arrive here, because they all
// end in the same two questions — do you have a key, and can you open it:
//
//   no key material   an account older than encryption, or an invited user.
//                     Set one up and show the recovery phrase once.
//   locked            the ordinary case. Password.
//   unopenable        the password was reset by email, which changed the
//                     password without touching the wrapped key. Only the
//                     recovery phrase gets back in, and it rewraps on the way.

type Mode = "checking" | "setup" | "phrase" | "unlock" | "recover" | "open";

type EncryptionGateProps = {
  session: Session;
  children: ReactNode;
};

export default function EncryptionGate({ session, children }: EncryptionGateProps) {
  const meta = session.user.user_metadata as EncMeta | undefined;
  const email = session.user.email ?? "";

  const [mode, setMode] = useState<Mode>("checking");
  const [password, setPassword] = useState("");
  const [phraseInput, setPhraseInput] = useState("");
  const [newPhrase, setNewPhrase] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // The key may already be in this tab's sessionStorage from before a reload.
    resumeFromSession(session.user.id).then((resumed) => {
      if (!active) return;
      if (resumed) setMode("open");
      else setMode(hasEncryption(meta) ? "unlock" : "setup");
    });
    return () => {
      active = false;
    };
    // Keyed on the account, not the whole metadata object: updateUser emits
    // USER_UPDATED with a fresh object on every profile save, and re-running
    // this then would re-lock a perfectly open session.
  }, [session.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMeta = useCallback(async (next: EncMeta) => {
    const { error } = await supabase.auth.updateUser({ data: next });
    if (error) throw new Error(error.message);
  }, []);

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    // Check the password before wrapping anything under it. A typo here would
    // wrap the key under a password nobody knows, and the account would be one
    // sign-out away from being readable only with a phrase it has not been
    // shown yet.
    const check = await supabase.auth.signInWithPassword({ email, password });
    if (check.error) {
      setMessage("Feil passord.");
      setPending(false);
      return;
    }

    try {
      const { meta: next, phrase } = await createKeys(password, session.user.id);
      await saveMeta(next);
      setNewPhrase(phrase);
      setPassword("");
      setMode("phrase");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke sette opp kryptering.");
    }
    setPending(false);
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    try {
    await unlockWithPassword(password, meta ?? {}, session.user.id);
      setPassword("");
      setMode("open");
    } catch {
      // AES-GCM's auth tag is what failed, so this is either the wrong password
      // or a key wrapped under an older one.
      setMessage("Feil passord. Har du nylig tilbakestilt passordet, må du bruke gjenopprettingskoden.");
    }
    setPending(false);
  }

  async function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    try {
    const next = await recoverWithPhrase(phraseInput, password, meta ?? {}, session.user.id);
      await saveMeta(next);
      setPhraseInput("");
      setPassword("");
      setMode("open");
    } catch {
      setMessage("Koden stemmer ikke.");
      setPending(false);
      return;
    }
    setPending(false);
  }

  if (mode === "open" && isUnlocked()) return <>{children}</>;

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <span className="badge">Regnskap</span>

        {mode === "checking" ? (
          <p className="helper">Låser opp...</p>
        ) : mode === "setup" ? (
          <>
            <h1>Slå på kryptering</h1>
            <p>
              Beløpene og beskrivelsene dine krypteres i nettleseren før de
              lagres, med en nøkkel som utledes av passordet ditt. Databasen —
              og den som drifter den — får bare se kryptert tekst.
            </p>
            <form className="form-grid" onSubmit={handleSetup}>
              <div className="field">
                <label htmlFor="enc-setup-password">passordet ditt</label>
                <input
                  id="enc-setup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  {pending ? "Setter opp..." : "Slå på kryptering"}
                </button>
              </div>
              {message ? <span className="status">{message}</span> : null}
            </form>
          </>
        ) : mode === "phrase" ? (
          <>
            <h1>Skriv ned gjenopprettingskoden</h1>
            <p>
              Dette er den <strong>eneste</strong> veien tilbake til tallene dine
              hvis du glemmer passordet. Den vises ikke igjen, og den kan ikke
              hentes fram — heller ikke av oss.
            </p>
            <code
              style={{
                display: "block",
                padding: "14px 16px",
                borderRadius: 10,
                background: "var(--surface-2, rgba(0,0,0,0.05))",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 16,
                letterSpacing: "0.06em",
                wordBreak: "break-all",
              }}
            >
              {newPhrase}
            </code>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setMode("open")}
              >
                Jeg har skrevet den ned
              </button>
            </div>
          </>
        ) : mode === "recover" ? (
          <>
            <h1>Bruk gjenopprettingskoden</h1>
            <p>
              Passordet ditt ble byttet uten nøkkelen, så den må åpnes med koden
              du skrev ned. Den knyttes til passordet du bruker nå.
            </p>
            <form className="form-grid" onSubmit={handleRecover}>
              <div className="field">
                <label htmlFor="enc-phrase">gjenopprettingskode</label>
                <input
                  id="enc-phrase"
                  type="text"
                  value={phraseInput}
                  onChange={(event) => setPhraseInput(event.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="enc-recover-password">passordet ditt</label>
                <input
                  id="enc-recover-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  {pending ? "Åpner..." : "Åpne"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setMode("unlock");
                  }}
                >
                  Tilbake
                </button>
              </div>
              {message ? <span className="status">{message}</span> : null}
            </form>
          </>
        ) : (
          <>
            <h1>Lås opp tallene</h1>
            <p>
              Dataene dine er krypterte. Passordet ditt låser dem opp her i
              nettleseren — det sendes ikke noe sted.
            </p>
            <form className="form-grid" onSubmit={handleUnlock}>
              <div className="field">
                <label htmlFor="enc-unlock-password">passord</label>
                <input
                  id="enc-unlock-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  {pending ? "Låser opp..." : "Lås opp"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setMode("recover");
                  }}
                >
                  Bruk gjenopprettingskode
                </button>
              </div>
              {message ? <span className="status">{message}</span> : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
