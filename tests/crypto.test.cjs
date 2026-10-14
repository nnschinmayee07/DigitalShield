const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "lib", "crypto.ts");
const compiledPath = path.join(__dirname, "..", ".crypto-test-module.cjs");
const source = fs.readFileSync(sourcePath, "utf8");
fs.writeFileSync(compiledPath, ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText);
const cryptoModule = require(compiledPath);

const validKey = () => require("node:crypto").randomBytes(32).toString("base64");
test.after(() => { try { fs.unlinkSync(compiledPath); } catch {} });

test("AES-256-GCM encrypt/decrypt round-trip preserves plaintext", () => {
  process.env.FIELD_ENCRYPTION_KEY = validKey();
  const plaintext = "demo private note — never a real password";
  const encrypted = cryptoModule.encryptField(plaintext);
  assert.notEqual(encrypted.ciphertext, plaintext);
  assert.equal(cryptoModule.decryptField(encrypted), plaintext);
  assert.ok(encrypted.iv && encrypted.tag && encrypted.ciphertext);
});

test("each encryption uses a fresh IV", () => {
  process.env.FIELD_ENCRYPTION_KEY = validKey();
  const first = cryptoModule.encryptField("same value");
  const second = cryptoModule.encryptField("same value");
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("tampering with ciphertext fails authentication", () => {
  process.env.FIELD_ENCRYPTION_KEY = validKey();
  const encrypted = cryptoModule.encryptField("sensitive test text");
  const bytes = Buffer.from(encrypted.ciphertext, "base64");
  bytes[0] ^= 1;
  assert.throws(() => cryptoModule.decryptField({ ...encrypted, ciphertext: bytes.toString("base64") }));
});

test("invalid encryption key length is rejected", () => {
  process.env.FIELD_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
  assert.throws(() => cryptoModule.encryptField("test"), /exactly 32 bytes/);
});
