"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  FileSearch,
  Fingerprint,
  Globe2,
  House,
  LogOut,
  RefreshCw,
  ScanSearch,
  SearchCheck,
  ShieldCheck,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";

type Tab = "Overview" | "Identities" | "Findings" | "Sources" | "Removal requests" | "Activity log";
type Row = {
  id: string;
  [key: string]: unknown;
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
  provider_name?: string;
  detected_at?: string;
  is_demo?: boolean;
  label?: string;
  kind?: string;
  identifier?: string;
  hasPrivateNotes?: boolean;
  name?: string;
  reference?: string;
  last_checked_at?: string | null;
  evidence_summary?: string;
  evidence_url?: string;
  created_at?: string;
  entity_type?: string;
  action?: string;
  entity_id?: string | null;
  target_url?: string;
  request_type?: string;
  notes?: string;
};
const tabs: { name: Tab; icon: LucideIcon }[] = [
  { name: "Overview", icon: House },
  { name: "Identities", icon: Fingerprint },
  { name: "Findings", icon: FileSearch },
  { name: "Sources", icon: Globe2 },
  { name: "Removal requests", icon: ShieldCheck },
  { name: "Activity log", icon: Activity },
];
const previewFindings: Row[] = [
  { id: "demo-1", title: "Public profile visibility review", description: "A demo review item for your presentation workspace.", severity: "medium", status: "open", provider_name: "Preview source", detected_at: new Date().toISOString(), is_demo: true },
  { id: "demo-2", title: "Username reuse check", description: "Example finding — no external service was queried.", severity: "low", status: "open", provider_name: "Preview source", detected_at: new Date(Date.now() - 86400000).toISOString(), is_demo: true },
  { id: "demo-3", title: "Old contact detail review", description: "Sample item to illustrate the finding workflow.", severity: "low", status: "resolved", provider_name: "Preview source", detected_at: new Date(Date.now() - 172800000).toISOString(), is_demo: true },
];
const previewIdentities: Row[] = [
  { id: "p1", label: "Primary email", kind: "email", identifier: "you@example.com", hasPrivateNotes: false },
  { id: "p2", label: "Public username", kind: "username", identifier: "your-handle", hasPrivateNotes: false },
];
const previewSources: Row[] = [
  { id: "s1", name: "Personal website", reference: "https://example.com", status: "unverified", last_checked_at: null },
  { id: "s2", name: "Public profile", reference: "https://example.com/profile", status: "unverified", last_checked_at: null },
];

function dateLabel(value?: string | null) { if (!value) return "Not checked yet"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
function titleCase(value?: string) { return (value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function Glyph({ children, icon: Icon }: { children?: React.ReactNode; icon?: LucideIcon }) { return <span className="glyph" aria-hidden="true">{Icon ? <Icon size={18} strokeWidth={1.8} /> : children}</span>; }

export default function Home() {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("Overview");
  const [authenticated, setAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanningSourceId, setScanningSourceId] = useState("");
  const [notice, setNotice] = useState("");
  const [apiOnline, setApiOnline] = useState(false);
  const [counts, setCounts] = useState({ identities: 0, sources: 0, findings: 0, openFindings: 0, activeRemovalRequests: 0 });
  const [identities, setIdentities] = useState<Row[]>(previewIdentities);
  const [findings, setFindings] = useState<Row[]>(previewFindings);
  const [sources, setSources] = useState<Row[]>(previewSources);
  const [removals, setRemovals] = useState<Row[]>([]);
  const [activity, setActivity] = useState<Row[]>([]);
  const [identityForm, setIdentityForm] = useState({ label: "", kind: "email", identifier: "", privateNotes: "" });
  const [sourceForm, setSourceForm] = useState({ name: "", reference: "" });
  const [removalForm, setRemovalForm] = useState({ providerName: "", targetUrl: "", kind: "manual_review", notes: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const health = await fetch("/api/health", { cache: "no-store" }); setApiOnline(health.ok);
      const authRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!authRes.ok) { setAuthenticated(false); setLoading(false); return; }
      const authJson = await authRes.json(); setAuthenticated(true); setUserEmail(authJson.user?.email || "Signed in");
      const [dashRes, idsRes, findRes, srcRes, remRes, logRes] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store" }), fetch("/api/identities", { cache: "no-store" }), fetch("/api/findings", { cache: "no-store" }),
        fetch("/api/sources", { cache: "no-store" }), fetch("/api/removal-requests", { cache: "no-store" }), fetch("/api/audit-logs", { cache: "no-store" }),
      ]);
      const [dash, ids, fs, ss, rs, logs] = await Promise.all([dashRes.json(), idsRes.json(), findRes.json(), srcRes.json(), remRes.json(), logRes.json()]);
      if (dashRes.ok && dash.data?.counts) setCounts(dash.data.counts);
      if (idsRes.ok) setIdentities(ids.data || []); if (findRes.ok) setFindings(fs.data || []);
      if (srcRes.ok) setSources(ss.data || []); if (remRes.ok) setRemovals(rs.data || []); if (logRes.ok) setActivity(logs.data || []);
    } catch { setApiOnline(false); setNotice("Could not reach the API. Check that the app is running and try refreshing."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const shownCounts = authenticated ? counts : { identities: identities.length, sources: sources.length, findings: findings.length, openFindings: findings.filter((f) => f.status === "open").length, activeRemovalRequests: 0 };
  const pageDescription = useMemo(() => ({ Overview: "A clear view of your digital exposure and privacy posture.", Identities: "Keep track of the identifiers you want to protect.", Findings: "Review, prioritize, and resolve exposure findings.", Sources: "Register only sources you own or are authorized to assess.", "Removal requests": "Track requests you may need to submit to providers.", "Activity log": "A traceable record of actions in your workspace." }[tab]), [tab]);

  async function createRecord(kind: "identity" | "source") {
    setBusy(true); setNotice("");
    try {
      const isIdentity = kind === "identity";
      const payload = isIdentity ? identityForm : sourceForm;
      const response = await fetch(isIdentity ? "/api/identities" : "/api/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || result?.error || "Could not save this record.");
      setNotice(isIdentity ? "Identity saved securely." : "Source added. It remains unverified until you authorize it.");
      if (isIdentity) setIdentityForm({ label: "", kind: "email", identifier: "", privateNotes: "" }); else setSourceForm({ name: "", reference: "" });
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save this record."); }
    finally { setBusy(false); }
  }
  async function scanAuthorizedSource(sourceId: string) {
    setBusy(true); setNotice("");
    setScanningSourceId(sourceId);
    try { const response = await fetch("/api/monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message || result?.error || "Could not scan this source."); setNotice(`${result.data?.source?.name || "Source"}: ${result.data?.warning || "Authorized scan complete."}`); await refresh(); setTab("Findings"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not scan this source."); }
    finally { setBusy(false); setScanningSourceId(""); }
  }
  async function authorizeSource(id: string) {
    const authorizationNote = window.prompt("Confirm why you are authorized to assess this source (required):");
    if (!authorizationNote?.trim()) return;
    try {
      const response = await fetch(`/api/sources/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "authorized", authorizationNote }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not authorize source.");
      setNotice("Source authorized. You can now scan its public pages."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not authorize source."); }
  }
  async function createRemoval() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/removal-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(removalForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || result?.error || "Could not record removal request.");
      setRemovalForm({ providerName: "", targetUrl: "", kind: "manual_review", notes: "" });
      setNotice(result.note || "Removal request recorded."); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not record removal request."); }
    finally { setBusy(false); }
  }
  async function updateFinding(id: string, status: string) {
    try { const response = await fetch(`/api/findings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message || "Update failed."); setNotice(`Finding marked ${status}.`); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Update failed."); }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }

  return <main className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 34 8v10c0 9-5.8 15-14 19C11.8 33 6 27 6 18V8z" fill="none" stroke="currentColor" strokeWidth="2.5"/><path d="m13 20 4.5 4.5L27 15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span><strong>digital<span>shield</span></strong><small>PRIVACY COMMAND CENTER</small></span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">{tabs.map((item) => <motion.button key={item.name} whileHover={reduceMotion ? undefined : { x: 3 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} className={`nav-item ${tab === item.name ? "active" : ""}`} onClick={() => setTab(item.name)}><Glyph icon={item.icon} /><span>{item.name}</span>{tab === item.name && <motion.i className="nav-active-rail" layoutId="nav-active-rail" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}{item.name === "Findings" && shownCounts.openFindings > 0 && <em>{shownCounts.openFindings}</em>}</motion.button>)}</nav>
      <div className="sidebar-bottom"><div className="shield-card"><div className="mini-shield"><ShieldCheck size={16} aria-hidden="true" /></div><strong>Your privacy, in focus.</strong><p>One place to monitor and manage your digital footprint.</p><div className="shield-line"><span /><span /><span /><span /><span /><span /><span /></div><small>SECURITY WORKSPACE</small></div><div className="profile-row"><div className="avatar">{authenticated ? (userEmail[0] || "U").toUpperCase() : "G"}</div><div className="profile-copy"><strong>{authenticated ? userEmail : "Guest preview"}</strong><small>{authenticated ? "Personal workspace" : "Preview mode"}</small></div>{authenticated && <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={16} aria-hidden="true" /></button>}</div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{tab}</strong></div><div className="top-actions"><div className={`connection ${apiOnline ? "online" : "offline"}`}><i />{apiOnline ? "API connected" : "API unavailable"}</div>{authenticated ? <button className="button button-quiet" onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" /> Refresh</button> : <Link className="button button-primary" href="/login">Sign in securely <span>→</span></Link>}</div></header>
      <div className="content-wrap">
        {!authenticated && <div className="preview-banner"><span className="preview-dot" /><div><strong>Preview workspace</strong><span> Sample records are illustrative. Sign in to load your private Supabase data and use the live API.</span></div><Link href="/login">Connect workspace →</Link></div>}
        {<AnimatePresence initial={false}>{notice && <motion.div className="notice" role="status" initial={reduceMotion ? false : { opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={reduceMotion ? undefined : { opacity: 0, y: -6, height: 0 }} transition={{ duration: 0.2 }}><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} aria-hidden="true" /></button></motion.div>}</AnimatePresence>}
        <motion.div className="page-heading" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}><div><div className="eyebrow">DIGITAL PRESENCE SECURITY</div><h1>{tab === "Overview" ? "Good to see you." : tab}</h1><p>{pageDescription}</p></div>{tab === "Overview" && <button className="button button-primary" disabled={!authenticated || busy || !sources.some((source) => source.status === "authorized")} onClick={() => { const source = sources.find((item) => item.status === "authorized"); if (source) void scanAuthorizedSource(source.id); }}><ScanSearch size={16} aria-hidden="true" /> {busy ? "Scanning…" : "Scan an authorized source"}</button>}</motion.div>

        {tab === "Overview" && <>
          <div className="stat-grid">
            <Stat label="Protected identities" value={shownCounts.identities} note="Identifiers in your vault" icon={Fingerprint} tone="purple" />
            <Stat label="Monitored sources" value={shownCounts.sources} note="Registered sources" icon={Globe2} tone="blue" />
            <Stat label="Open findings" value={shownCounts.openFindings} note="Items to review" icon={FileSearch} tone="orange" />
            <Stat label="Removal requests" value={shownCounts.activeRemovalRequests} note="Active requests" icon={ShieldCheck} tone="green" />
          </div>
          <div className="overview-grid"><section className="panel findings-panel"><div className="panel-head"><div><h2>Recent findings</h2><p>Latest items across your workspace</p></div><button className="text-button" onClick={() => setTab("Findings")}>View all <span>→</span></button></div><FindingList rows={findings.slice(0, 4)} /></section><section className="panel posture-panel"><div className="panel-head"><div><h2>Privacy posture</h2><p>A quick workspace snapshot</p></div><span className="status-pill neutral">{authenticated ? "LIVE DATA" : "PREVIEW"}</span></div><div className="posture-score"><div className="score-ring" aria-label={authenticated ? "Illustrative workspace score based on open findings" : "Demo score unavailable"}><div><strong>{authenticated ? Math.max(0, 100 - shownCounts.openFindings * 8) : "—"}</strong><span>{authenticated ? "ESTIMATE" : "DEMO"}</span></div></div><div className="score-copy"><strong>{authenticated ? (shownCounts.openFindings === 0 ? "Looking steady" : "Review recommended") : "Connect to calculate"}</strong><p>{authenticated ? "Based on current open findings in your workspace." : "Sign in to see a posture summary based on your own data."}</p></div></div><div className="posture-row"><span><i className="dot purple-dot" />Identities stored</span><strong>{shownCounts.identities}</strong></div><div className="posture-row"><span><i className="dot blue-dot" />Sources registered</span><strong>{shownCounts.sources}</strong></div><div className="posture-row"><span><i className="dot orange-dot" />Open items</span><strong>{shownCounts.openFindings}</strong></div><div className="privacy-note"><span><ShieldCheck size={15} aria-hidden="true" /></span><p>Scans are limited to sites you authorize and follow each site&apos;s robots.txt rules.</p></div></section></div>
          <section className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>Keep your digital footprint organized</p></div></div><div className="quick-grid"><QuickAction icon={UserPlus} title="Add an identity" detail="Email, username, profile" onClick={() => setTab("Identities")} /><QuickAction icon={Globe2} title="Register a source" detail="Add a site you control" onClick={() => setTab("Sources")} /><QuickAction icon={ShieldCheck} title="Track a removal" detail="Record a provider request" onClick={() => setTab("Removal requests")} /></div></section>
        </>}

        {tab === "Identities" && <><section className="panel form-panel"><div className="panel-head"><div><h2>Add a protected identity</h2><p>Private notes are encrypted on the server before storage.</p></div></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (authenticated) void createRecord("identity"); else setNotice("Sign in to save identities to your private workspace."); }}><label>Display name<input required maxLength={120} value={identityForm.label} onChange={(e) => setIdentityForm({ ...identityForm, label: e.target.value })} placeholder="e.g. Personal email" /></label><label>Identity type<select value={identityForm.kind} onChange={(e) => setIdentityForm({ ...identityForm, kind: e.target.value })}><option value="email">Email</option><option value="social_profile">Social profile</option><option value="website">Website</option><option value="username">Username</option><option value="phone">Phone</option><option value="other">Other</option></select></label><label className="span-2">Identifier<input required maxLength={2048} value={identityForm.identifier} onChange={(e) => setIdentityForm({ ...identityForm, identifier: e.target.value })} placeholder="Email, profile URL, username, or phone" /></label><label className="span-2">Private notes <span className="optional">(optional)</span><textarea maxLength={10000} rows={2} value={identityForm.privateNotes} onChange={(e) => setIdentityForm({ ...identityForm, privateNotes: e.target.value })} placeholder="Context you want to remember…" /></label><div className="form-footer span-2"><span>Protected by your signed-in session</span><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Add identity →"}</button></div></form></section><section className="panel table-panel"><PanelTitle title="Identity vault" subtitle={`${identities.length} ${authenticated ? "saved identities" : "sample identities"}`} /><div className="table-scroll"><table><thead><tr><th>Identity</th><th>Type</th><th>Identifier</th><th>Private notes</th></tr></thead><tbody>{identities.map((row) => <tr key={row.id}><td><strong>{row.label}</strong></td><td><span className="type-label">{titleCase(row.kind)}</span></td><td className="mono">{row.identifier}</td><td>{row.hasPrivateNotes ? <span className="status-pill green">Encrypted</span> : <span className="muted">—</span>}</td></tr>)}</tbody></table>{!identities.length && <Empty text="No identities yet. Add one above to get started." />}</div></section></>}

        {tab === "Findings" && <section className="panel table-panel"><PanelTitle title="Exposure findings" subtitle="Review possible matches from your authorized source scans" /><div className="finding-table">{findings.map((row) => <motion.div className="finding-row" key={row.id} layout initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}><div className="finding-severity"><span className={`severity-mark ${row.severity || "low"}`} /></div><div className="finding-main"><strong>{row.title}</strong><p>{row.description || row.evidence_summary || "No additional description provided."}</p><div className="finding-meta"><span>{row.provider_name || "Source review"}</span><span>·</span><span>{dateLabel(row.detected_at)}</span>{row.is_demo && <span className="status-pill neutral">DEMO</span>}{row.evidence_url?.match(/^https?:\/\//i) && <a href={row.evidence_url} target="_blank" rel="noopener noreferrer">Open evidence ↗</a>}</div></div><div className="finding-actions"><span className={`status-pill ${row.status === "resolved" ? "green" : row.status === "dismissed" ? "neutral" : "orange"}`}>{titleCase(row.status)}</span>{authenticated && row.status === "open" && <button className="small-action" onClick={() => void updateFinding(row.id, "resolved")}>Resolve</button>}</div></motion.div>)}{!findings.length && <Empty text="No findings yet. Add an identifier and scan an authorized public source." />}</div><div className="panel-footnote">Scans follow robots.txt, stay within the registered site path, and store only the evidence URL and match category—not the matched identifier or page content. Review possible matches manually.</div></section>}

        {tab === "Sources" && <><section className="panel form-panel"><div className="panel-head"><div><h2>Register a source</h2><p>Only add websites or profiles you own or have permission to assess.</p></div></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (authenticated) void createRecord("source"); else setNotice("Sign in to save sources to your private workspace."); }}><label>Source name<input required maxLength={120} value={sourceForm.name} onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })} placeholder="e.g. Personal website" /></label><label>Website or profile URL<input required type="url" maxLength={2048} value={sourceForm.reference} onChange={(e) => setSourceForm({ ...sourceForm, reference: e.target.value })} placeholder="https://example.com" /></label><div className="form-footer span-2"><span>New sources start as unverified</span><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Register source →"}</button></div></form></section><section className="panel table-panel"><PanelTitle title="Registered sources" subtitle="Authorization status and last review" /><div className="table-scroll"><table><thead><tr><th>Source</th><th>Reference</th><th>Status</th><th>Last checked</th><th>Action</th></tr></thead><tbody>{sources.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td className="mono">{row.reference}</td><td><span className={`status-pill ${row.status === "authorized" ? "green" : row.status === "disabled" ? "neutral" : "orange"}`}>{titleCase(row.status)}</span></td><td>{dateLabel(row.last_checked_at)}</td><td><div className="source-actions">{authenticated && row.status !== "authorized" && <button className="small-action" disabled={busy} onClick={() => void authorizeSource(row.id)}>{row.status === "disabled" ? "Re-authorize" : "Confirm authorization"}</button>}{authenticated && row.status === "authorized" && <button className="small-action scan-action" disabled={busy} onClick={() => void scanAuthorizedSource(row.id)}><ScanSearch size={14} aria-hidden="true" />{scanningSourceId === row.id ? "Scanning…" : "Scan public pages"}</button>}{!authenticated && <span className="muted">Sign in to manage</span>}</div></td></tr>)}</tbody></table>{!sources.length && <Empty text="No sources registered yet." />}</div></section></>}

        {tab === "Removal requests" && <><section className="panel form-panel"><div className="panel-head"><div><h2>Record a removal request</h2><p>Create a tracking entry for a provider process you will submit separately.</p></div></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (authenticated) void createRemoval(); else setNotice("Sign in to record removal requests in your private workspace."); }}><label>Provider or website<input required maxLength={160} value={removalForm.providerName} onChange={(e) => setRemovalForm({ ...removalForm, providerName: e.target.value })} placeholder="e.g. Website support team" /></label><label>Target URL<input required type="url" maxLength={2048} value={removalForm.targetUrl} onChange={(e) => setRemovalForm({ ...removalForm, targetUrl: e.target.value })} placeholder="https://example.com/page" /></label><label>Request type<select value={removalForm.kind} onChange={(e) => setRemovalForm({ ...removalForm, kind: e.target.value })}><option value="manual_review">Manual review</option><option value="site_takedown">Site takedown</option><option value="credential_reset">Credential reset</option></select></label><label>Notes <span className="optional">(optional)</span><input maxLength={4000} value={removalForm.notes} onChange={(e) => setRemovalForm({ ...removalForm, notes: e.target.value })} placeholder="Reference or next step" /></label><div className="form-footer span-2"><span>Recording does not submit a provider takedown</span><button className="button button-primary" disabled={busy}>{busy ? "Recording…" : "Record request →"}</button></div></form></section><section className="panel info-panel"><div className="info-icon">↗</div><div><h2>Provider removal workflow</h2><p>Requests here are a tracking record. You must submit removal requests through the provider’s official process; creating a record does not remove third-party content automatically.</p></div></section><section className="panel table-panel"><PanelTitle title="Removal request tracker" subtitle={`${removals.length} recorded requests`} /><div className="table-scroll"><table><thead><tr><th>Provider</th><th>Target URL</th><th>Request type</th><th>Status</th><th>Created</th></tr></thead><tbody>{removals.map((row) => <tr key={row.id}><td><strong>{row.provider_name}</strong></td><td className="mono">{row.target_url}</td><td>{titleCase(row.kind)}</td><td><span className="status-pill neutral">{titleCase(row.status)}</span></td><td>{dateLabel(row.created_at)}</td></tr>)}</tbody></table>{!removals.length && <Empty text={authenticated ? "No removal requests yet. This tracker is ready when you need it." : "Sign in to view and track your removal requests."} />}</div></section></>}

        {tab === "Activity log" && <section className="panel table-panel"><PanelTitle title="Workspace activity" subtitle="Most recent recorded actions" /><div className="table-scroll"><table><thead><tr><th>Action</th><th>Record type</th><th>Time</th><th>Reference</th></tr></thead><tbody>{activity.map((row) => <tr key={row.id}><td><strong>{titleCase(row.action)}</strong></td><td>{titleCase(row.entity_type)}</td><td>{dateLabel(row.created_at)}</td><td className="mono">{row.entity_id || "—"}</td></tr>)}</tbody></table>{!activity.length && <Empty text={authenticated ? "Activity will appear here as you use your workspace." : "Sign in to see your private activity log."} />}</div></section>}
        <footer className="footer"><span>DigitalShield <b>·</b> Digital Presence Security</span><span><i /> Your workspace, your control</span></footer>
      </div>
    </section>
  </main>;
}

function Stat({ label, value, note, icon, tone }: { label: string; value: number; note: string; icon: LucideIcon; tone: string }) { const reduceMotion = useReducedMotion(); return <motion.div className="stat-card" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} whileHover={reduceMotion ? undefined : { y: -4 }} transition={{ duration: 0.3, ease: "easeOut" }}><div className={`stat-icon ${tone}`}><Glyph icon={icon} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div><div className={`stat-spark ${tone}`} aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div></motion.div>; }
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
function FindingList({ rows }: { rows: Row[] }) { const reduceMotion = useReducedMotion(); return <div className="compact-findings">{rows.map((row) => <motion.div className="compact-finding" key={row.id} initial={reduceMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}><div className={`finding-icon ${row.severity || "low"}`}>{row.severity === "high" ? "!" : "↗"}</div><div className="compact-copy"><strong>{row.title}</strong><p>{row.provider_name || "Source review"} <span>·</span> {dateLabel(row.detected_at)}</p></div><span className={`status-pill ${row.status === "resolved" ? "green" : row.status === "dismissed" ? "neutral" : "orange"}`}>{titleCase(row.status)}</span></motion.div>)}{!rows.length && <Empty text="No findings to display." />}</div>; }
function QuickAction({ icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick: () => void }) { const reduceMotion = useReducedMotion(); return <motion.button whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.99 }} className="quick-action" onClick={onClick}><span className="quick-icon"><Glyph icon={icon} /></span><span className="quick-copy"><strong>{title}</strong><small>{detail}</small></span><span className="quick-arrow">↗</span></motion.button>; }
function Empty({ text }: { text: string }) { return <div className="empty-state"><SearchCheck size={20} aria-hidden="true" /><p>{text}</p></div>; }
