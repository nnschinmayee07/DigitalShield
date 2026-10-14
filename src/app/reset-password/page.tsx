"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [updated, setUpdated] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-password", password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Password could not be updated.");
      setUpdated(true);
      setMessage("Password updated. Your account is ready to use.");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="reset-title">
        <Link href="/" className="login-brand" aria-label="DigitalShield home">
          <span className="login-brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <span>digital<strong>shield</strong></span>
        </Link>
        <div className="login-intro">
          <span className="login-kicker">ACCOUNT RECOVERY</span>
          <h1 id="reset-title">Choose a new password.</h1>
          <p>Use at least 8 characters. This replaces your current account password.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" name="new-password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="login-submit" type="submit" disabled={busy || updated}>
            {updated ? <CheckCircle2 size={17} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
            <span>{busy ? "Updating password…" : updated ? "Password updated" : "Update password"}</span>
            {!busy && !updated && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>
        {message && <div className={`login-message ${updated ? "login-message-success" : "login-message-error"}`} role={updated ? "status" : "alert"}>{message}</div>}
        <Link href="/login" className="login-back"><ArrowLeft size={15} aria-hidden="true" /> Return to sign in</Link>
      </section>
    </main>
  );
}
