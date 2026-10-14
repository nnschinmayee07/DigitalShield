"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  useEffect(() => {
    setCallbackError(new URLSearchParams(window.location.search).get("error"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not start sign-in.");
      setMessageType("success");
      setMessage("If this address can receive sign-in links, an email will arrive shortly. Open the newest link in this same browser.");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Could not start sign-in.");
    } finally {
      setBusy(false);
    }
  }

  const callbackMessage = callbackError === "missing_code"
    ? "The sign-in link arrived without a code. Request a new link and open it in this same browser."
    : callbackError === "code_exchange_failed"
      ? "This sign-in link could not be verified. Request a new link; links can only be used once."
      : callbackError
        ? "Sign-in could not be completed. Request a new link and try again."
        : "";

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <Link href="/" className="login-brand" aria-label="DigitalShield home">
          <span className="login-brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <span>digital<strong>shield</strong></span>
        </Link>

        <div className="login-intro">
          <span className="login-kicker">PRIVATE BY DESIGN</span>
          <h1 id="login-title">Your privacy, in focus.</h1>
          <p>Sign in with a one-time email link. No password to remember, and your protected workspace stays yours.</p>
        </div>

        {callbackMessage && <div className="login-message login-message-error" role="alert">{callbackMessage}</div>}

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <button className="login-submit" type="submit" disabled={busy}>
            <Mail size={17} aria-hidden="true" />
            <span>{busy ? "Sending secure link…" : "Email me a sign-in link"}</span>
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>

        {message && (
          <div className={`login-message ${messageType === "error" ? "login-message-error" : "login-message-success"}`} role={messageType === "error" ? "alert" : "status"}>
            {messageType === "success" && <CheckCircle2 size={17} aria-hidden="true" />}
            <span>{message}</span>
          </div>
        )}

        <div className="login-security-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>One-time access link · Secure session cookies</span>
        </div>
        <Link href="/" className="login-back"><ArrowLeft size={15} aria-hidden="true" /> Back to workspace</Link>
      </section>
    </main>
  );
}
