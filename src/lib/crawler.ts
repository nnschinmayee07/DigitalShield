import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";

const USER_AGENT = "DigitalShieldBot";
const REQUEST_TIMEOUT_MS = 1_500;
const MAX_ROBOTS_BYTES = 512 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_PAGES = 4;
const MAX_SCAN_RUNTIME_MS = 20_000;
const MAX_LINKS_PER_PAGE = 100;
const MAX_REDIRECTS = 3;
const MAX_HTML_TEXT = 500_000;
const REQUEST_HEADERS = {
  "user-agent": `${USER_AGENT}/1.0`,
  accept: "text/html,application/xhtml+xml;q=0.9",
  "accept-encoding": "identity",
  "accept-language": "en",
  connection: "close",
};

export type SearchIdentity = {
  kind: string;
  identifier: string;
};

export type CrawledMatch = {
  evidenceUrl: string;
  identityKinds: string[];
};

export type CrawlResult = {
  pagesVisited: number;
  matches: CrawledMatch[];
  blockedByRobots: boolean;
  limitReached: boolean;
};

export class CrawlerError extends Error {
  constructor(
    public readonly code:
      | "invalid_url"
      | "unsafe_host"
      | "robots_unavailable"
      | "robots_blocked"
      | "network_error"
      | "response_too_large"
      | "unsupported_content",
  ) {
    super(code);
    this.name = "CrawlerError";
  }
}

type PinnedAddress = { address: string; family: 4 | 6 };
type HttpResponse = {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
};
type CrawlScope = { origin: string; startPath: string };

export function normalizeStartUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CrawlerError("invalid_url");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname ||
    isLocalHostname(url.hostname) ||
    (url.port !== "" &&
      Number(url.port) !== (url.protocol === "https:" ? 443 : 80))
  ) {
    throw new CrawlerError("invalid_url");
  }

  url.hash = "";
  return url;
}

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export function isWithinScope(candidate: URL, scope: CrawlScope): boolean {
  if (candidate.origin !== scope.origin) return false;
  if (scope.startPath === "/") return true;
  return (
    candidate.pathname === scope.startPath ||
    candidate.pathname.startsWith(
      scope.startPath.endsWith("/") ? scope.startPath : `${scope.startPath}/`,
    )
  );
}

export function findIdentityMatches(
  text: string,
  identities: SearchIdentity[],
): string[] {
  const normalizedText = text.normalize("NFKC").toLocaleLowerCase("en");
  const compactText = normalizedText.replace(/\D/g, "");
  const matchedKinds = new Set<string>();

  for (const identity of identities) {
    const identifier = identity.identifier.trim().normalize("NFKC");
    if (!identifier) continue;

    const kind = identity.kind.toLowerCase();
    if (kind === "email") {
      if (normalizedText.includes(identifier.toLocaleLowerCase("en"))) {
        matchedKinds.add(kind);
      }
      continue;
    }

    if (kind === "phone") {
      const digits = identifier.replace(/\D/g, "");
      if (digits.length >= 7 && compactText.includes(digits)) matchedKinds.add(kind);
      continue;
    }

    if (kind === "username" || kind === "social_profile") {
      let username = identifier.replace(/^@/, "");
      if (kind === "social_profile") {
        try {
          const profileUrl = new URL(identifier);
          username =
            profileUrl.pathname
              .split("/")
              .filter(Boolean)
              .at(-1)
              ?.replace(/^@/, "") ?? username;
        } catch {
          username = username.split("/").filter(Boolean).at(-1) ?? username;
        }
      }
      if (username.length < 4) continue;
      const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}_.-])${escaped}(?![\\p{L}\\p{N}_.-])`,
        "iu",
      );
      if (pattern.test(text.normalize("NFKC"))) matchedKinds.add(kind);
    }
  }

  return [...matchedKinds];
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid")
  );
}

async function resolvePublicAddress(
  hostname: string,
  timeoutMs: number,
): Promise<PinnedAddress> {
  if (isLocalHostname(hostname)) throw new CrawlerError("unsafe_host");

  let addresses: Array<{ address: string; family: number }>;
  const literalFamily = isIP(hostname);
  try {
    if (literalFamily) {
      addresses = [{ address: hostname, family: literalFamily }];
    } else {
      let timeout: NodeJS.Timeout | undefined;
      try {
        addresses = await Promise.race([
          lookup(hostname, { all: true, verbatim: true }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new CrawlerError("network_error")),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  } catch (error) {
    if (error instanceof CrawlerError) throw error;
    throw new CrawlerError("network_error");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new CrawlerError("unsafe_host");
  }

  const address = addresses[0];
  if (address.family !== 4 && address.family !== 6) {
    throw new CrawlerError("unsafe_host");
  }

  return { address: address.address, family: address.family };
}

function requestPinned(
  url: URL,
  pinned: PinnedAddress,
  maxBytes: number,
  timeoutMs: number,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: pinned.address,
      family: pinned.family,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { ...REQUEST_HEADERS, host: url.host },
      agent: false as const,
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    };
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(requestOptions, (response) => {
      const contentLength = Number(response.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.destroy();
        reject(new CrawlerError("response_too_large"));
        return;
      }
      const encoding = response.headers["content-encoding"]?.toLowerCase();
      if (encoding && encoding !== "identity") {
        response.destroy();
        reject(new CrawlerError("unsupported_content"));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy();
          request.destroy(new CrawlerError("response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
      response.on("error", () => reject(new CrawlerError("network_error")));
    });

    const absoluteTimeout = setTimeout(() =>
      request.destroy(new CrawlerError("network_error")),
    timeoutMs);
    request.once("close", () => clearTimeout(absoluteTimeout));
    request.setTimeout(timeoutMs, () =>
      request.destroy(new CrawlerError("network_error")),
    );
    request.on("error", (error) => {
      reject(
        error instanceof CrawlerError
          ? error
          : new CrawlerError("network_error"),
      );
    });
    request.end();
  });
}

async function requestWithinOrigin(
  initialUrl: URL,
  scope: CrawlScope,
  maxBytes: number,
  enforcePathScope: boolean,
  deadlineAt: number,
  robots?: ReturnType<typeof robotsParser> | null,
): Promise<{ url: URL; response: HttpResponse }> {
  let url = new URL(initialUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (
      url.origin !== scope.origin ||
      (enforcePathScope && !isWithinScope(url, scope))
    ) {
      throw new CrawlerError("unsafe_host");
    }
    if (robots?.isAllowed(url.toString(), USER_AGENT) === false) {
      throw new CrawlerError("robots_blocked");
    }

    const remainingBeforeDns = deadlineAt - Date.now();
    if (remainingBeforeDns <= 0) throw new CrawlerError("network_error");
    const pinned = await resolvePublicAddress(
      url.hostname,
      Math.min(REQUEST_TIMEOUT_MS, remainingBeforeDns),
    );
    const remainingBeforeRequest = deadlineAt - Date.now();
    if (remainingBeforeRequest <= 0) throw new CrawlerError("network_error");
    const response = await requestPinned(
      url,
      pinned,
      maxBytes,
      Math.min(REQUEST_TIMEOUT_MS, remainingBeforeRequest),
    );
    const location = response.headers.location;
    if (![301, 302, 303, 307, 308].includes(response.statusCode) || !location) {
      return { url, response };
    }
    if (redirects === MAX_REDIRECTS) throw new CrawlerError("network_error");

    try {
      url = normalizeStartUrl(new URL(location, url).toString());
    } catch {
      throw new CrawlerError("unsafe_host");
    }
  }

  throw new CrawlerError("network_error");
}

function createScope(startUrl: URL): CrawlScope {
  return { origin: startUrl.origin, startPath: startUrl.pathname };
}

function toRobotsUrl(startUrl: URL): URL {
  return new URL("/robots.txt", startUrl.origin);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function crawlAuthorizedSource(
  sourceReference: string,
  identities: SearchIdentity[],
): Promise<CrawlResult> {
  const startUrl = normalizeStartUrl(sourceReference);
  const scope = createScope(startUrl);
  const robotsUrl = toRobotsUrl(startUrl);
  const startedAt = Date.now();
  const deadlineAt = startedAt + MAX_SCAN_RUNTIME_MS;
  const { response: robotsResponse } = await requestWithinOrigin(
    robotsUrl,
    scope,
    MAX_ROBOTS_BYTES,
    false,
    deadlineAt,
  );

  let robots: ReturnType<typeof robotsParser> | null = null;
  if (robotsResponse.statusCode === 404 || robotsResponse.statusCode === 410) {
    robots = null;
  } else if (robotsResponse.statusCode >= 200 && robotsResponse.statusCode < 300) {
    robots = robotsParser(
      robotsUrl.toString(),
      robotsResponse.body.toString("utf8"),
    );
  } else {
    throw new CrawlerError("robots_unavailable");
  }

  const queue: URL[] = [startUrl];
  const queued = new Set([startUrl.toString()]);
  const visited = new Set<string>();
  const matchesByUrl = new Map<string, Set<string>>();
  const crawlDelaySeconds = robots?.getCrawlDelay(USER_AGENT) ?? 0;
  let pagesVisited = 0;
  let requestsMade = 0;
  let blockedByRobots = false;
  let limitReached = false;

  while (queue.length > 0 && pagesVisited < MAX_PAGES) {
    const pageUrl = queue.shift();
    if (!pageUrl || visited.has(pageUrl.toString())) continue;
    visited.add(pageUrl.toString());

    if (robots?.isAllowed(pageUrl.toString(), USER_AGENT) === false) {
      blockedByRobots = true;
      continue;
    }

    if (requestsMade > 0 && crawlDelaySeconds > 0) {
      const delayMs = Math.ceil(crawlDelaySeconds * 1000);
      if (Date.now() - startedAt + delayMs > MAX_SCAN_RUNTIME_MS) {
        limitReached = true;
        break;
      }
      await wait(delayMs);
    }
    if (Date.now() - startedAt >= MAX_SCAN_RUNTIME_MS) {
      limitReached = true;
      break;
    }
    requestsMade += 1;

    let pageResponse: Awaited<ReturnType<typeof requestWithinOrigin>>;
    try {
      pageResponse = await requestWithinOrigin(
        pageUrl,
        scope,
        MAX_PAGE_BYTES,
        true,
        deadlineAt,
        robots,
      );
    } catch (error) {
      if (error instanceof CrawlerError && error.code === "robots_blocked") {
        blockedByRobots = true;
        continue;
      }
      throw error;
    }
    const { url: finalUrl, response } = pageResponse;
    if (response.statusCode < 200 || response.statusCode >= 300) continue;

    const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      continue;
    }

    const html = response.body.toString("utf8");
    const $ = load(html);
    $("script, style, noscript, template, svg").remove();
    const text = $("body").text().replace(/\s+/g, " ").slice(0, MAX_HTML_TEXT);
    pagesVisited += 1;

    const identityKinds = findIdentityMatches(text, identities);
    if (identityKinds.length > 0) {
      matchesByUrl.set(finalUrl.toString(), new Set(identityKinds));
    }

    for (const href of $("a[href]").map((_, link) => $(link).attr("href")).get()) {
      if (queue.length >= MAX_LINKS_PER_PAGE) break;
      try {
        const candidate = normalizeStartUrl(new URL(href, finalUrl).toString());
        candidate.search = "";
        if (
          isWithinScope(candidate, scope) &&
          !visited.has(candidate.toString()) &&
          !queued.has(candidate.toString()) &&
          robots?.isAllowed(candidate.toString(), USER_AGENT) !== false
        ) {
          queue.push(candidate);
          queued.add(candidate.toString());
        }
      } catch {
        continue;
      }
    }
  }

  return {
    pagesVisited,
    matches: [...matchesByUrl.entries()].map(([evidenceUrl, kinds]) => ({
      evidenceUrl,
      identityKinds: [...kinds],
    })),
    blockedByRobots,
    limitReached: limitReached || queue.length > 0,
  };
}
