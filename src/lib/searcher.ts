import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import { findIdentityMatches, type SearchIdentity } from "./crawler";

const USER_AGENT = "Mozilla/5.0 (compatible; DigitalShieldBot/1.0)";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_RESULTS_PER_IDENTITY = 5;
const MAX_IDENTITIES = 20;

export type SearchFinding = {
  evidenceUrl: string;
  identityLabel: string;
  identityKind: string;
  title: string;
  snippet: string;
};

export type SearchScanResult = {
  findings: SearchFinding[];
  identitiesScanned: number;
  errors: string[];
};

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function safeFetch(url: string): Promise<{ body: string; ok: boolean }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { body: "", ok: false };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return { body: "", ok: false };

  const hostname = parsed.hostname;
  if (isIP(hostname) !== 0) return { body: "", ok: false };

  let addresses: { address: string }[];
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns_timeout")), 3000)),
    ]);
  } catch {
    return { body: "", ok: false };
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    return { body: "", ok: false };
  }

  return new Promise((resolve) => {
    const send = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      {
        hostname: addresses[0].address,
        port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: {
          host: parsed.host,
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
          "accept-language": "en",
          connection: "close",
        },
        agent: false,
        ...(parsed.protocol === "https:" ? { servername: parsed.hostname } : {}),
      },
      (res) => {
        if ((res.statusCode ?? 0) >= 300) {
          res.destroy();
          resolve({ body: "", ok: false });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PAGE_BYTES) { res.destroy(); return; }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), ok: true }));
        res.on("error", () => resolve({ body: "", ok: false }));
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(); resolve({ body: "", ok: false }); });
    req.on("error", () => resolve({ body: "", ok: false }));
    req.end();
  });
}

async function searchDuckDuckGo(query: string): Promise<{ url: string; title: string; snippet: string }[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const { body, ok } = await safeFetch(searchUrl);
  if (!ok || !body) return [];

  const $ = load(body);
  const results: { url: string; title: string; snippet: string }[] = [];

  $(".result__body").each((_, el) => {
    if (results.length >= MAX_RESULTS_PER_IDENTITY) return false;
    const anchor = $(el).find(".result__a").first();
    const href = anchor.attr("href") || "";
    const title = anchor.text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();

    // DDG wraps URLs — extract the actual URL from uddg param or direct href
    let url = href;
    try {
      const parsed = new URL(href.startsWith("/") ? `https://duckduckgo.com${href}` : href);
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) url = decodeURIComponent(uddg);
    } catch { /* keep as-is */ }

    if (url && url.startsWith("http") && title) {
      results.push({ url, title, snippet });
    }
  });

  return results;
}

function buildQuery(identity: { kind: string; identifier: string }): string {
  const { kind, identifier } = identity;
  if (kind === "email") return `"${identifier}"`;
  if (kind === "phone") return `"${identifier}"`;
  if (kind === "username") return `"${identifier}"`;
  if (kind === "social_profile") {
    try {
      const u = new URL(identifier);
      const handle = u.pathname.split("/").filter(Boolean).at(-1) ?? identifier;
      return `"${handle}" site:${u.hostname}`;
    } catch {
      return `"${identifier}"`;
    }
  }
  return `"${identifier}"`;
}

export async function scanIdentitiesOnline(
  identities: Array<{ id: string; kind: string; identifier: string; label: string }>,
): Promise<SearchScanResult> {
  const findings: SearchFinding[] = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  const scannable = identities
    .filter((i) => ["email", "phone", "username", "social_profile"].includes(i.kind))
    .slice(0, MAX_IDENTITIES);

  for (const identity of scannable) {
    const query = buildQuery(identity);
    let results: { url: string; title: string; snippet: string }[];
    try {
      results = await searchDuckDuckGo(query);
    } catch {
      errors.push(`Search failed for ${identity.label}`);
      continue;
    }

    const searchIdentity: SearchIdentity = { kind: identity.kind, identifier: identity.identifier };

    for (const result of results) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      // Verify: check if the identity actually appears on the page
      const { body } = await safeFetch(result.url);
      const textToCheck = body
        ? (() => { try { const $ = load(body); $("script,style,noscript").remove(); return $("body").text().replace(/\s+/g, " ").slice(0, 200_000); } catch { return body.slice(0, 200_000); } })()
        : result.snippet;

      const matched = findIdentityMatches(textToCheck, [searchIdentity]);
      if (matched.length > 0 || body === "") {
        // Include if matched on page, or if we couldn't fetch (trust search snippet)
        const snippetMatched = findIdentityMatches(result.snippet, [searchIdentity]);
        if (matched.length > 0 || snippetMatched.length > 0) {
          findings.push({
            evidenceUrl: result.url,
            identityLabel: identity.label,
            identityKind: identity.kind,
            title: result.title || "Potential exposure",
            snippet: result.snippet,
          });
        }
      }
    }
  }

  return { findings, identitiesScanned: scannable.length, errors };
}
