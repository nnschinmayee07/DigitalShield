"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  FileSearch,
  Fingerprint,
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

type Tab = "Overview" | "Identities" | "Findings" | "Removal requests" | "Activity log";
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
  { name: "Removal requests", icon: ShieldCheck },
  { name: "Activity log", icon: Activity },
];

const previewFindings: Row[] = [
  { id: "demo-1", title: "Email found on public forum", description: "Your email address appeared in a public post.", severity: "high", status: "open", provider_name: "example-forum.com", detected_at: new Date().toISOString(), is_demo: true },
  { id: "demo-2", title: "Username found on profile page", description: "Your username was found on a public profile.", severity: "medium", status: "open", provider_name: "somesite.com", detected_at: new Date(Date.now() - 86400000).toISOString(), is_demo: true },
  { id: "demo-3", title: "Phone number exposure", description: "A phone number matched a public directory listing.", severity: "high", status: "resolved", provider_name: "directory.example.com", detected_at: new Date(Date.now() - 172800000).toISOString(), is_demo: true },
];
const previewIdentities: Row[] = [
  { id: "p1", label: "Primary email", kind: "email", identifier: "you@example.com", hasPrivateNotes: false },
  { id: "p2", label: "Public username", kind: "username", identifier: "your-handle", hasPrivateNotes: false },
];

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
function titleCase(value?: string) { return (value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()); }
function Glyph({ children, icon: Icon }: { children?: React.ReactNode; icon?: LucideIcon }) {
  return <span className="glyph" aria-hidden="true">{Icon ? <Icon size={18} strokeWidth={1.8} /> : children}</span>;
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("Overview");
  const [authenticated, setAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [apiOnline, setApiOnline] = useState(false);
  const [counts, setCounts] = useState({ identities: 0, findings: 0, openFindings: 0, activeRemovalRequests: 0 });
  const [identities, setIdentities] = useState<Row[]>(previewIdentities);
  const [findings, setFindings] = useState<Row[]>(previewFindings);
  const [removals, setRemovals] = useState<Row[]>([]);
  const [activity, setActivity] = useState<Row[]>([]);
  const [identityForm, setIdentityForm] = useState({ label: "", kind: "email", identifier: "", privateNotes: "" });
  const [removalForm, setRemovalForm] = useState({ providerName: "", targetUrl: "", kind: "manual_review", notes: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const health = await fetch("/api/health", { cache: "no-store" });
      setApiOnline(health.ok);
      const authRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!authRes.ok) { setAuthenticated(false); setLoading(false); return; }
      const authJson = await authRes.json();
      setAuthenticated(true);
      setUserEmail(authJson.user?.email || "Signed in");
      const [dashRes, idsRes, findRes, remRes, logRes] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store" }),
        fetch("/api/identities", { cache: "no-store" }),
        fetch("/api/findings", { cache: "no-store" }),
        fetch("/api/removal-requests", { cache: "no-store" }),
        fetch("/api/audit-logs", { cache: "no-store" }),
      ]);
      const [dash, ids, fs, rs, logs] = await Promise.all([
        dashRes.json(), idsRes.json(), findRes.json(), remRes.json(), logRes.json(),
      ]);
      if (dashRes.ok && dash.data?.counts) setCounts(dash.data.counts);
      if (idsRes.ok) setIdentities(ids.data || []);
      if (findRes.ok) setFindings(fs.data || []);
      if (remRes.ok) setRemovals(rs.data || []);
      if (logRes.ok) setActivity(logs.data || []);
    } catch {
      setApiOnline(false);
      setNotice("Could not reach the API. Check that the app is running and try refreshing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const shownCounts = authenticated
    ? counts
    : { identities: identities.length, findings: findings.length, openFindings: findings.filter((f) => f.status === "open").length, activeRemovalRequests: 0 };

  const pageDescription = useMemo(() => ({
    Overview: "A clear view of your digital exposure and privacy posture.",
    Identities: "Keep track of the identifiers you want to protect.",
    Findings: "Pages on the internet where your identities were found.",
    "Removal requests": "Track requests you may need to submit to providers.",
    "Activity log": "A traceable record of actions in your workspace.",
  }[tab]), [tab]);

  async function scanInternet() {
    setScanning(true);
    setNotice("");
    try {
      const response = await fetch("/api/monitor", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Scan failed.");
      const { identitiesScanned, newFindings, warning } = result.data;
      setNotice(
        newFindings > 0
          ? `Scan complete — ${newFindings} new exposure${newFindings > 1 ? "s" : ""} found across ${identitiesScanned} identit${identitiesScanned > 1 ? "ies" : "y"}.`
          : warning || `Scan complete — no new exposures found for ${identitiesScanned} identit${identitiesScanned > 1 ? "ies" : "y"}.`
      );
      await refresh();
      if (newFindings > 0) setTab("Findings");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function createIdentity() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/identities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(identityForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not save identity.");
      setNotice("Identity saved securely.");
      setIdentityForm({ label: "", kind: "email", identifier: "", privateNotes: "" });
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save identity."); }
    finally { setBusy(false); }
  }

  async function createRemoval() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/removal-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(removalForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not record removal request.");
      setRemovalForm({ providerName: "", targetUrl: "", kind: "manual_review", notes: "" });
      setNotice("Removal request recorded.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not record removal request."); }
    finally { setBusy(false); }
  }

  async function updateFinding(id: string, status: string) {
    try {
      const response = await fetch(`/api/findings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Update failed.");
      setNotice(`Finding marked ${status}.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Update failed."); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const canScan = authenticated && !scanning;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <path d="M20 3 34 8v10c0 9-5.8 15-14 19C11.8 33 6 27 6 18V8z" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <path d="m13 20 4.5 4.5L27 15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span><strong>digital<span>shield</span></strong><small>PRIVACY COMMAND CENTER</small></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {tabs.map((item) => (
            <motion.button key={item.name} whileHover={reduceMotion ? undefined : { x: 3 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              className={`nav-item ${tab === item.name ? "active" : ""}`} onClick={() => setTab(item.name)}>
              <Glyph icon={item.icon} />
              <span>{item.name}</span>
              {tab === item.name && <motion.i className="nav-active-rail" layoutId="nav-active-rail" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              {item.name === "Findings" && shownCounts.openFindings > 0 && <em>{shownCounts.openFindings}</em>}
            </motion.button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shield-card">
            <div className="mini-shield"><ShieldCheck size={16} aria-hidden="true" /></div>
            <strong>Your privacy, in focus.</strong>
            <p>One place to monitor and manage your digital footprint.</p>
            <div className="shield-line"><span /><span /><span /><span /><span /><span /><span /></div>
            <small>SECURITY WORKSPACE</small>
          </div>
          <div className="profile-row">
            <div className="avatar">{authenticated ? (userEmail[0] || "U").toUpperCase() : "G"}</div>
            <div className="profile-copy">
              <strong>{authenticated ? userEmail : "Guest preview"}</strong>
              <small>{authenticated ? "Personal workspace" : "Preview mode"}</small>
            </div>
            {authenticated && <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={16} aria-hidden="true" /></button>}
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{tab}</strong></div>
          <div className="top-actions">
            <div className={`connection ${apiOnline ? "online" : "offline"}`}><i />{apiOnline ? "API connected" : "API unavailable"}</div>
            {authenticated
              ? <button className="button button-quiet" disabled={loading} onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" className={loading ? "spin" : ""} /> {loading ? "Loading…" : "Refresh"}</button>
              : <Link className="button button-primary" href="/login">Sign in <span>→</span></Link>}
          </div>
        </header>
        <div className="content-wrap">
          {!authenticated && (
            <div className="preview-banner">
              <span className="preview-dot" />
              <div><strong>Preview workspace</strong><span> Sign in to scan the internet for your identities and see real findings.</span></div>
              <Link href="/login">Sign in →</Link>
            </div>
          )}

          <AnimatePresence initial={false}>
            {notice && (
              <motion.div className="notice" role="status"
                initial={reduceMotion ? false : { opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.2 }}>
                <span>{notice}</span>
                <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} aria-hidden="true" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div className="page-heading"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
            <div>
              <div className="eyebrow">DIGITAL PRESENCE SECURITY</div>
              <h1>{tab === "Overview" ? "Good to see you." : tab}</h1>
              <p>{pageDescription}</p>
            </div>
            {tab === "Overview" && (
              <button className="button button-primary" disabled={!canScan} onClick={() => void scanInternet()}>
                <ScanSearch size={16} aria-hidden="true" />
                {scanning ? "Scanning the internet…" : "Scan for my exposures"}
              </button>
            )}
          </motion.div>

          {tab === "Overview" && <>
            <div className="stat-grid">
              <Stat label="Protected identities" value={shownCounts.identities} note="Identifiers in your vault" icon={Fingerprint} tone="purple" />
              <Stat label="Open findings" value={shownCounts.openFindings} note="Exposures to review" icon={FileSearch} tone="orange" />
              <Stat label="Total findings" value={shownCounts.findings} note="All detected exposures" icon={ScanSearch} tone="blue" />
              <Stat label="Removal requests" value={shownCounts.activeRemovalRequests} note="Active requests" icon={ShieldCheck} tone="green" />
            </div>
            <div className="overview-grid">
              <section className="panel findings-panel">
                <div className="panel-head">
                  <div><h2>Recent findings</h2><p>Latest internet exposures detected</p></div>
                  <button className="text-button" onClick={() => setTab("Findings")}>View all <span>→</span></button>
                </div>
                <FindingList rows={findings.slice(0, 4)} />
              </section>
              <section className="panel posture-panel">
                <div className="panel-head">
                  <div><h2>Privacy posture</h2><p>A quick workspace snapshot</p></div>
                  <span className="status-pill neutral">{authenticated ? "LIVE DATA" : "PREVIEW"}</span>
                </div>
                <div className="posture-score">
                  <div className="score-ring" aria-label="Illustrative score based on open findings">
                    <div>
                      <strong>{authenticated ? Math.max(0, 100 - shownCounts.openFindings * 8) : "—"}</strong>
                      <span>{authenticated ? "ESTIMATE" : "DEMO"}</span>
                    </div>
                  </div>
                  <div className="score-copy">
                    <strong>{authenticated ? (shownCounts.openFindings === 0 ? "Looking steady" : "Review recommended") : "Connect to calculate"}</strong>
                    <p>{authenticated ? "Based on current open findings in your workspace." : "Sign in to see a posture summary based on your own data."}</p>
                  </div>
                </div>
                <div className="posture-row"><span><i className="dot purple-dot" />Identities stored</span><strong>{shownCounts.identities}</strong></div>
                <div className="posture-row"><span><i className="dot orange-dot" />Open findings</span><strong>{shownCounts.openFindings}</strong></div>
                <div className="privacy-note">
                  <span><ShieldCheck size={15} aria-hidden="true" /></span>
                  <p>Scans search the public internet for your saved identities. Review each finding manually before taking action.</p>
                </div>
              </section>
            </div>
            <section className="panel quick-panel">
              <div className="panel-head"><div><h2>Quick actions</h2><p>Keep your digital footprint organized</p></div></div>
              <div className="quick-grid">
                <QuickAction icon={UserPlus} title="Add an identity" detail="Email, username, phone" onClick={() => setTab("Identities")} />
                <QuickAction icon={ScanSearch} title="Scan the internet" detail="Find where you appear" onClick={() => { if (authenticated) void scanInternet(); else setTab("Identities"); }} />
                <QuickAction icon={ShieldCheck} title="Track a removal" detail="Record a takedown request" onClick={() => setTab("Removal requests")} />
              </div>
            </section>
          </>}

          {tab === "Identities" && <>
            <section className="panel form-panel">
              <div className="panel-head"><div><h2>Add a protected identity</h2><p>Add emails, usernames, or phone numbers to scan for online. Private notes are encrypted.</p></div></div>
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (authenticated) void createIdentity(); else setNotice("Sign in to save identities."); }}>
                <label>Display name<input required maxLength={120} value={identityForm.label} onChange={(e) => setIdentityForm({ ...identityForm, label: e.target.value })} placeholder="e.g. Personal email" /></label>
                <label>Identity type
                  <select value={identityForm.kind} onChange={(e) => setIdentityForm({ ...identityForm, kind: e.target.value })}>
                    <option value="email">Email</option>
                    <option value="username">Username</option>
                    <option value="phone">Phone</option>
                    <option value="social_profile">Social profile URL</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="span-2">Identifier<input required maxLength={2048} value={identityForm.identifier} onChange={(e) => setIdentityForm({ ...identityForm, identifier: e.target.value })} placeholder="Email address, username, phone number, or profile URL" /></label>
                <label className="span-2">Private notes <span className="optional">(optional, encrypted)</span>
                  <textarea maxLength={10000} rows={2} value={identityForm.privateNotes} onChange={(e) => setIdentityForm({ ...identityForm, privateNotes: e.target.value })} placeholder="Context you want to remember…" />
                </label>
                <div className="form-footer span-2">
                  <span>Email, username, phone, and social profiles are scanned</span>
                  <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Add identity →"}</button>
                </div>
              </form>
            </section>
            <section className="panel table-panel">
              <PanelTitle title="Identity vault" subtitle={`${identities.length} ${authenticated ? "saved" : "sample"} identities`} />
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Label</th><th>Type</th><th>Identifier</th><th>Private notes</th></tr></thead>
                  <tbody>{identities.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.label}</strong></td>
                      <td><span className="type-label">{titleCase(row.kind)}</span></td>
                      <td className="mono">{row.identifier}</td>
                      <td>{row.hasPrivateNotes ? <span className="status-pill green">Encrypted</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {!identities.length && <Empty text="No identities yet. Add one above — then scan to find where you appear online." />}
              </div>
            </section>
          </>}

          {tab === "Findings" && (
            <section className="panel table-panel">
              <div className="panel-head">
                <div><h2>Exposure findings</h2><p>Pages on the internet where your identities were detected</p></div>
                <button className="button button-primary" disabled={!canScan} onClick={() => void scanInternet()}>
                  <ScanSearch size={14} aria-hidden="true" />{scanning ? "Scanning…" : "Scan now"}
                </button>
              </div>
              <div className="finding-table">
                {findings.map((row) => (
                  <motion.div className="finding-row" key={row.id} layout
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                    <div className="finding-severity"><span className={`severity-mark ${row.severity || "low"}`} /></div>
                    <div className="finding-main">
                      <strong>{row.title}</strong>
                      <p>{row.description || row.evidence_summary || "Your identity was found on this public page."}</p>
                      <div className="finding-meta">
                        <span>{row.provider_name || "Unknown source"}</span>
                        <span>·</span>
                        <span>{dateLabel(row.detected_at)}</span>
                        {row.is_demo && <span className="status-pill neutral">DEMO</span>}
                        {row.evidence_url?.match(/^https?:\/\//i) && (
                          <a href={row.evidence_url} target="_blank" rel="noopener noreferrer">Open page ↗</a>
                        )}
                      </div>
                    </div>
                    <div className="finding-actions">
                      <span className={`status-pill ${row.status === "resolved" ? "green" : row.status === "dismissed" ? "neutral" : "orange"}`}>{titleCase(row.status)}</span>
                      {authenticated && row.status === "open" && (
                        <button className="small-action" onClick={() => void updateFinding(row.id, "resolved")}>Resolve</button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {!findings.length && <Empty text="No findings yet. Add identities and click Scan to search the internet." />}
              </div>
              <div className="panel-footnote">Findings are based on public search results. Review each page manually before submitting a removal request.</div>
            </section>
          )}

          {tab === "Removal requests" && <>
            <section className="panel form-panel">
              <div className="panel-head"><div><h2>Record a removal request</h2><p>Track takedown requests you submit to providers.</p></div></div>
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (authenticated) void createRemoval(); else setNotice("Sign in to record removal requests."); }}>
                <label>Provider or website<input required maxLength={160} value={removalForm.providerName} onChange={(e) => setRemovalForm({ ...removalForm, providerName: e.target.value })} placeholder="e.g. example.com support" /></label>
                <label>Target URL<input required type="url" maxLength={2048} value={removalForm.targetUrl} onChange={(e) => setRemovalForm({ ...removalForm, targetUrl: e.target.value })} placeholder="https://example.com/page" /></label>
                <label>Request type
                  <select value={removalForm.kind} onChange={(e) => setRemovalForm({ ...removalForm, kind: e.target.value })}>
                    <option value="manual_review">Manual review</option>
                    <option value="site_takedown">Site takedown</option>
                    <option value="credential_reset">Credential reset</option>
                  </select>
                </label>
                <label className="span-2">Notes <span className="optional">(optional)</span>
                  <textarea maxLength={4000} rows={2} value={removalForm.notes} onChange={(e) => setRemovalForm({ ...removalForm, notes: e.target.value })} placeholder="Reference number, next step…" />
                </label>
                <div className="form-footer span-2">
                  <span>Recording does not submit a provider request automatically</span>
                  <button className="button button-primary" disabled={busy}>{busy ? "Recording…" : "Record request →"}</button>
                </div>
              </form>
            </section>
            <section className="panel table-panel">
              <PanelTitle title="Removal request tracker" subtitle={`${removals.length} recorded`} />
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Provider</th><th>Target URL</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>{removals.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.provider_name}</strong></td>
                      <td className="mono">{row.target_url}</td>
                      <td>{titleCase(row.request_type ?? row.kind)}</td>
                      <td><span className="status-pill neutral">{titleCase(row.status)}</span></td>
                      <td>{dateLabel(row.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {!removals.length && <Empty text={authenticated ? "No removal requests yet." : "Sign in to track removal requests."} />}
              </div>
            </section>
          </>}

          {tab === "Activity log" && (
            <section className="panel table-panel">
              <PanelTitle title="Workspace activity" subtitle="Most recent recorded actions" />
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Action</th><th>Record type</th><th>Time</th><th>Reference</th></tr></thead>
                  <tbody>{activity.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{titleCase(row.action)}</strong></td>
                      <td>{titleCase(row.entity_type)}</td>
                      <td>{dateLabel(row.created_at)}</td>
                      <td className="mono">{row.entity_id || "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {!activity.length && <Empty text={authenticated ? "Activity will appear here as you use your workspace." : "Sign in to see your activity log."} />}
              </div>
            </section>
          )}

          <footer className="footer">
            <span>DigitalShield <b>·</b> Digital Presence Security</span>
            <span><i /> Your workspace, your control</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, note, icon, tone }: { label: string; value: number; note: string; icon: LucideIcon; tone: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div className="stat-card" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} whileHover={reduceMotion ? undefined : { y: -4 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <div className={`stat-icon ${tone}`}><Glyph icon={icon} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
      <div className={`stat-spark ${tone}`} aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div>
    </motion.div>
  );
}
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}
function FindingList({ rows }: { rows: Row[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="compact-findings">
      {rows.map((row) => (
        <motion.div className="compact-finding" key={row.id}
          initial={reduceMotion ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>
          <div className={`finding-icon ${row.severity || "low"}`}>{row.severity === "high" || row.severity === "critical" ? "!" : "↗"}</div>
          <div className="compact-copy">
            <strong>{row.title}</strong>
            <p>{row.provider_name || "Unknown"} <span>·</span> {dateLabel(row.detected_at)}</p>
          </div>
          <span className={`status-pill ${row.status === "resolved" ? "green" : row.status === "dismissed" ? "neutral" : "orange"}`}>{titleCase(row.status)}</span>
        </motion.div>
      ))}
      {!rows.length && <Empty text="No findings yet. Add identities and scan to get started." />}
    </div>
  );
}
function QuickAction({ icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick: () => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.99 }} className="quick-action" onClick={onClick}>
      <span className="quick-icon"><Glyph icon={icon} /></span>
      <span className="quick-copy"><strong>{title}</strong><small>{detail}</small></span>
      <span className="quick-arrow">↗</span>
    </motion.button>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="empty-state"><SearchCheck size={20} aria-hidden="true" /><p>{text}</p></div>;
}
