"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

type AuthMode = "sign-in" | "sign-up" | "reset-password";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const response = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          email,
          ...(mode !== "reset-password" ? { password } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result?.error?.message || "Authentication could not be completed.") as Error & { code?: string };
        error.code = result?.error?.code;
        throw error;
      }

      setMessageType("success");
      if (mode === "sign-in") {
        window.location.assign("/");
        return;
      }
      if (mode === "sign-up") {
        if (result.authenticated) {
          window.location.assign("/");
          return;
        }
        setMessage("Account created. Check your email to confirm your address, then sign in with your password.");
      } else {
        setMessage(result.message || "If an account exists for that address, password reset instructions will arrive shortly.");
      }
      setPassword("");
    } catch (error) {
      setMessageType("error");
      if (error instanceof Error && "code" in error && error.code === "email_not_confirmed") {
        setMessageType("error");
        setMessage(error.message);
      } else {
        setMessage(error instanceof Error ? error.message : "Authentication could not be completed.");
      }
    } finally {
      setBusy(false);
    }
  }

  const callbackMessage = callbackError === "missing_code"
    ? "The email confirmation or reset link arrived without a code. Request a new one and open it in this same browser."
    : callbackError === "code_exchange_failed"
      ? "This verification link could not be used. Request a new link; links can only be used once."
      : callbackError
        ? "Verification could not be completed. Request a new link and try again."
        : "";
  const title = mode === "sign-in"
    ? "Welcome back."
    : mode === "sign-up"
      ? "Create your account."
      : "Reset your password.";
  const submitLabel = mode === "sign-in"
    ? "Sign in securely"
    : mode === "sign-up"
      ? "Create account"
      : "Send reset instructions";

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <Link href="/" className="login-brand" aria-label="DigitalShield home">
          <span className="login-brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <span>digital<strong>shield</strong></span>
        </Link>

        <div className="login-intro">
          <span className="login-kicker">PRIVATE BY DESIGN</span>
          <h1 id="login-title">{title}</h1>
          <p>
            {mode === "reset-password"
              ? "Enter your account email and we’ll send instructions to reset your password."
              : "Use your email and password to access your protected privacy workspace."}
          </p>
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
          {mode !== "reset-password" && <>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "sign-in" ? "Your password" : "At least 8 characters"}
            />
          </>}
          <button className="login-submit" type="submit" disabled={busy}>
            {mode === "reset-password" ? <KeyRound size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
            <span>{busy ? "Please wait…" : submitLabel}</span>
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>

        {mode === "sign-in" && <button className="login-text-button" type="button" onClick={() => { setMode("reset-password"); setMessage(""); }}>Forgot password?</button>}
        {mode !== "reset-password" && (
          <p className="login-switch">
            {mode === "sign-in" ? "New to DigitalShield?" : "Already have an account?"}
            {" "}
            <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>
              {mode === "sign-in" ? "Create account" : "Sign in"}
            </button>
          </p>
        )}
        {mode === "reset-password" && <button className="login-text-button" type="button" onClick={() => { setMode("sign-in"); setMessage(""); }}>Back to sign in</button>}

        {message && (
          <div className={`login-message ${messageType === "error" ? "login-message-error" : "login-message-success"}`} role={messageType === "error" ? "alert" : "status"}>
            {messageType === "success" && <CheckCircle2 size={17} aria-hidden="true" />}
            <span>{message}</span>
          </div>
        )}

        <div className="login-security-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Password protected · Secure, HTTP-only session cookies</span>
        </div>
        <Link href="/" className="login-back"><ArrowLeft size={15} aria-hidden="true" /> Back to workspace</Link>
      </section>
    </main>
  );
}
