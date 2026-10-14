"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  useEffect(() => { setCallbackError(new URLSearchParams(window.location.search).get("error")); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setMessage("If this address can receive sign-in links, an email will arrive shortly. Use the newest link and open it in this same browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start sign-in.");
    } finally {
      setBusy(false);
    }
  }

  const callbackMessage = callbackError === "missing_code"
    ? "The callback arrived without a sign-in code. Request one new link and open it in the same browser; check the terminal if this repeats."
    : callbackError === "code_exchange_failed"
      ? "Supabase could not exchange the sign-in code. Check the terminal and the allowed redirect URLs."
      : callbackError
        ? "Sign-in could not be completed. Request a new link and check the server terminal for a safe diagnostic."
        : "";

  return <main style={{ maxWidth: 440, margin: "12vh auto", padding: 24, fontFamily: "system-ui,sans-serif", color: "#172033" }}>
    <p style={{ color: "#7163d9", fontWeight: 700, letterSpacing: 2 }}>DIGITALSHIELD</p>
    <h1>Sign in securely</h1>
    <p style={{ color: "#657086", lineHeight: 1.7 }}>We&apos;ll email you a one-time sign-in link.</p>
    {callbackMessage && <p role="alert" style={{ color: "#9a3412", background: "#fff7ed", padding: 12, borderRadius: 8 }}>{callbackMessage}</p>}
    <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 24 }}>
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ padding: 12, border: "1px solid #d9deea", borderRadius: 8 }} />
      <button disabled={busy} style={{ padding: 12, background: "#7664e5", color: "white", border: 0, borderRadius: 8, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
    {message && <p role="status" style={{ marginTop: 18, color: "#6256b6", lineHeight: 1.6 }}>{message}</p>}
    <p style={{ marginTop: 22, fontSize: 13 }}><Link href="/">← Back to workspace</Link></p>
  </main>;
}
