const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "lib", "crawler.ts");
const compiledPath = path.join(__dirname, "..", ".crawler-test-module.cjs");
fs.writeFileSync(
  compiledPath,
  ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
);
const crawler = require(compiledPath);
test.after(() => {
  try {
    fs.unlinkSync(compiledPath);
  } catch {}
});

test("source URL validation only permits standard public web protocols and ports", () => {
  assert.equal(
    crawler.normalizeStartUrl("https://example.com/profile").hostname,
    "example.com",
  );
  for (const value of [
    "file:///etc/passwd",
    "http://user:pass@example.com",
    "http://example.com:8080",
    "http://example.com:443",
    "https://example.com:80",
    "http://localhost",
    "https://service.internal",
  ]) {
    assert.throws(() => crawler.normalizeStartUrl(value));
  }
});

test("public address validation blocks private, local, and reserved IP ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.4.5",
    "192.168.1.2",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(crawler.isPublicAddress(address), false, address);
  }
  assert.equal(crawler.isPublicAddress("1.1.1.1"), true);
  assert.equal(crawler.isPublicAddress("2606:4700:4700::1111"), true);
});

test("crawl scope cannot escape the registered origin or path prefix", () => {
  const scope = { origin: "https://example.com", startPath: "/profile" };
  assert.equal(crawler.isWithinScope(new URL("https://example.com/profile"), scope), true);
  assert.equal(
    crawler.isWithinScope(new URL("https://example.com/profile/about"), scope),
    true,
  );
  assert.equal(
    crawler.isWithinScope(new URL("https://example.com/profiles-other"), scope),
    false,
  );
  assert.equal(
    crawler.isWithinScope(new URL("https://elsewhere.example/profile"), scope),
    false,
  );
});

test("identifier matching reports kinds without returning matched values", () => {
  assert.deepEqual(
    crawler.findIdentityMatches(
      "Contact demo@example.com or @shield_user and @public_handle; call +1 (415) 555-0198.",
      [
        { kind: "email", identifier: "DEMO@example.com" },
        { kind: "username", identifier: "shield_user" },
        { kind: "social_profile", identifier: "https://social.example/@public_handle" },
        { kind: "phone", identifier: "+1 415 555 0198" },
        { kind: "username", identifier: "abc" },
      ],
    ),
    ["email", "username", "social_profile", "phone"],
  );
  assert.deepEqual(
    crawler.findIdentityMatches("shield_user_extra", [
      { kind: "username", identifier: "shield_user" },
    ]),
    [],
  );
});
