const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "lib", "validators.ts");
const compiledPath = path.join(__dirname, "..", ".validators-test-module.cjs");
fs.writeFileSync(compiledPath, ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText);
const schemas = require(compiledPath);
test.after(() => { try { fs.unlinkSync(compiledPath); } catch {} });

test("identity schema accepts valid payload and applies default kind", () => {
  const parsed = schemas.createIdentitySchema.safeParse({ label: "Primary email", identifier: "demo@example.com" });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.kind, "other");
});

test("identity schema rejects extra fields and empty identifiers", () => {
  assert.equal(schemas.createIdentitySchema.safeParse({ label: "x", identifier: "", admin: true }).success, false);
});

test("identity patch schema requires at least one field", () => {
  assert.equal(schemas.updateIdentitySchema.safeParse({}).success, false);
  assert.equal(schemas.updateIdentitySchema.safeParse({ label: "Updated label" }).success, true);
});
