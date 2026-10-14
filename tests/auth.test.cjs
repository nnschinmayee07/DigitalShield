const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "lib", "auth-schemas.ts");
const compiledPath = path.join(__dirname, "..", ".auth-test-module.cjs");
fs.writeFileSync(compiledPath, ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText);
const { passwordAuthSchema } = require(compiledPath);
test.after(() => { try { fs.unlinkSync(compiledPath); } catch {} });

test("password sign-in accepts an email and password", () => {
  assert.equal(passwordAuthSchema.safeParse({
    action: "sign-in",
    email: "person@example.com",
    password: "correct-horse-battery",
  }).success, true);
});

test("registration requires a valid email and an eight-character password", () => {
  assert.equal(passwordAuthSchema.safeParse({
    action: "sign-up",
    email: "person@example.com",
    password: "eight888",
  }).success, true);
  assert.equal(passwordAuthSchema.safeParse({
    action: "sign-up",
    email: "not-an-email",
    password: "short",
  }).success, false);
});

test("password recovery validates reset and update payloads", () => {
  assert.equal(passwordAuthSchema.safeParse({
    action: "reset-password",
    email: "person@example.com",
  }).success, true);
  assert.equal(passwordAuthSchema.safeParse({
    action: "update-password",
    password: "new-password-123",
  }).success, true);
  assert.equal(passwordAuthSchema.safeParse({
    action: "update-password",
    email: "person@example.com",
    password: "new-password-123",
  }).success, false);
});

test("password auth rejects extra properties", () => {
  assert.equal(passwordAuthSchema.safeParse({
    action: "sign-in",
    email: "person@example.com",
    password: "correct-horse-battery",
    admin: true,
  }).success, false);
});
