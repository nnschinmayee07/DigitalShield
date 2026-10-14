import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const encoded = process.env.FIELD_ENCRYPTION_KEY;
  if (!encoded) throw new Error("FIELD_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes.");
  return key;
}

export type EncryptedField = { ciphertext: string; iv: string; tag: string };
export function encryptField(plaintext: string): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function decryptField(value: EncryptedField): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/** Returns true only when the configured key decodes to exactly 32 bytes. */
export function isEncryptionKeyConfigured(): boolean {
  try { encryptionKey(); return true; } catch { return false; }
}
