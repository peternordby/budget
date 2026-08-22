"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import Avatar from "@/components/Avatar";
import { supabase } from "@/lib/supabaseClient";
import { displayName, fullName } from "@/lib/profile";
import styles from "./profil.module.css";

type Feedback = { tone: "ok" | "error"; text: string } | null;

export default function ProfilPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);

  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  const [signingOut, setSigningOut] = useState(false);

  // The user object rather than the session: `new_email` (the pending address
  // during a change) lives on it, and it is what auth.updateUser returns.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setNameDraft(fullName(data.user));
      setEmailDraft(data.user?.email ?? "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameSaving(true);
    setNameFeedback(null);

    const name = nameDraft.trim();
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: name },
    });

    if (error) {
      setNameFeedback({ tone: "error", text: error.message });
    } else {
      // updateUser emits USER_UPDATED, which AuthGate's listener already
      // catches — so the nav chip renames itself without this page telling it.
      setUser(data.user);
      setNameFeedback({
        tone: "ok",
        text: name ? "Navnet er lagret." : "Navnet er fjernet.",
      });
    }
    setNameSaving(false);
  }

  async function handleSaveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = emailDraft.trim();
    if (!email) {
      setEmailFeedback({ tone: "error", text: "E-post er påkrevd." });
      return;
    }
    if (email === user?.email) {
      setEmailFeedback({ tone: "error", text: "Dette er allerede adressen din." });
      return;
    }

    setEmailSaving(true);
    setEmailFeedback(null);

    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/profil` }
    );

    if (error) {
      setEmailFeedback({ tone: "error", text: error.message });
    } else {
      // Supabase's "Secure email change" is on by default, which sends a
      // confirmation to *both* addresses and applies the change only once both
      // are followed. Saying so here matters: otherwise the address in the
      // field looks saved while nothing has actually changed yet.
      setEmailFeedback({
        tone: "ok",
        text: `Vi har sendt en bekreftelse til både ${user?.email} og ${email}. Begge må åpnes før adressen bytter.`,
      });
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    }
    setEmailSaving(false);
  }

  async function handleSavePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 6) {
      setPasswordFeedback({ tone: "error", text: "Nytt passord må være minst 6 tegn." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ tone: "error", text: "De to passordene er ikke like." });
      return;
    }
    if (!user?.email) return;

    setPasswordSaving(true);

    // Supabase does not check the old password on updateUser, so an unlocked
    // laptop would otherwise be enough to change the password and lock the
    // owner out. Signing in with the entered one verifies it; it returns a
    // session for the same user, so nothing else changes.
    const check = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (check.error) {
      setPasswordFeedback({ tone: "error", text: "Nåværende passord stemmer ikke." });
      setPasswordSaving(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordFeedback({ tone: "error", text: error.message });
    } else {
      setPasswordFeedback({ tone: "ok", text: "Passordet er endret." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordSaving(false);
  }

  async function handleSignOut() {
    setSigningOut(true);
    // Awaited, unlike the old nav button: a failed sign-out that is never
    // awaited leaves the session in place with nothing said about it.
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
    }
    // On success AuthGate's listener sees the null session and redirects.
  }

  if (loading) {
    return (
      <section className="card section-gap">
        <p className="helper">Laster profilen din...</p>
      </section>
    );
  }

  const name = displayName(user);

  return (
    <>
      <section className="card section-gap">
        <div className={styles["identity"]}>
          <Avatar name={name} size="lg" />
          <div className={styles["identity-text"]}>
            <h1 className={styles["identity-name"]}>{name}</h1>
            <span className="helper">{user?.email}</span>
            {user?.new_email ? (
              <span className="badge badge-warn">
                Venter på bekreftelse: {user.new_email}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Navn</h2>
        </div>
        <form className="form-grid" onSubmit={handleSaveName}>
          <div className="field">
            <label htmlFor="profile-name">navn</label>
            <input
              id="profile-name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Peter Nordby"
              autoComplete="name"
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={nameSaving}>
              {nameSaving ? "Lagrer..." : "Lagre navn"}
            </button>
          </div>
          {nameFeedback ? (
            <span className={nameFeedback.tone === "ok" ? "helper" : "status"}>
              {nameFeedback.text}
            </span>
          ) : null}
        </form>
        <p className="helper">
          Navnet vises øverst til høyre. Lar du det stå tomt, brukes den første
          delen av e-postadressen.
        </p>
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">E-post</h2>
        </div>
        <form className="form-grid" onSubmit={handleSaveEmail}>
          <div className="field">
            <label htmlFor="profile-email">e-postadresse</label>
            <input
              id="profile-email"
              type="email"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={emailSaving}>
              {emailSaving ? "Sender..." : "Bytt e-post"}
            </button>
          </div>
          {emailFeedback ? (
            <span className={emailFeedback.tone === "ok" ? "helper" : "status"}>
              {emailFeedback.text}
            </span>
          ) : null}
        </form>
        <p className="helper">
          Adressen byttes først når du har åpnet bekreftelsen i begge innboksene
          — både den gamle og den nye. Fram til da logger du inn med den gamle.
        </p>
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Passord</h2>
        </div>
        <form className="form-grid" onSubmit={handleSavePassword}>
          <div className="field">
            <label htmlFor="current-password">nåværende passord</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="profile-new-password">nytt passord</label>
            <input
              id="profile-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="profile-confirm-password">gjenta nytt passord</label>
            <input
              id="profile-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Endrer..." : "Endre passord"}
            </button>
          </div>
          {passwordFeedback ? (
            <span className={passwordFeedback.tone === "ok" ? "helper" : "status"}>
              {passwordFeedback.text}
            </span>
          ) : null}
        </form>
      </section>

      <section className="card section-gap">
        <div className="card-head">
          <h2 className="section-title">Logg ut</h2>
        </div>
        <p className="helper">
          Logger deg ut på denne enheten. Data ligger trygt i skyen.
        </p>
        <div className="form-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Logger ut..." : "Logg ut"}
          </button>
        </div>
      </section>
    </>
  );
}
