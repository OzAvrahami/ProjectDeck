import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = 1;

export class ProviderCredentialsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProviderCredentialsError";
    this.code = code;
  }
}

export function parseCredentialsEncryptionKey(
  value = process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY,
) {
  if (!value) {
    throw new ProviderCredentialsError(
      "encryption_key_missing",
      "Provider credential encryption is not configured.",
    );
  }

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new ProviderCredentialsError(
      "encryption_key_invalid",
      "Provider credential encryption requires a 32-byte key.",
    );
  }

  return key;
}

export function encryptProviderCredentials(credentials, keyValue) {
  const key = parseCredentialsEncryptionKey(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);

  return {
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptProviderCredentials(envelope, keyValue) {
  try {
    if (
      envelope?.version !== ENVELOPE_VERSION ||
      envelope?.algorithm !== ALGORITHM
    ) {
      throw new Error("unsupported envelope");
    }

    const key = parseCredentialsEncryptionKey(keyValue);
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plaintext);
  } catch (error) {
    if (error instanceof ProviderCredentialsError) throw error;
    throw new ProviderCredentialsError(
      "credential_decryption_failed",
      "Stored provider credentials could not be decrypted.",
    );
  }
}

