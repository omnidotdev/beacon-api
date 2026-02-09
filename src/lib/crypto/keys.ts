import { env } from "../config/env";

// AES-256-GCM encryption for provider keys

const ALGORITHM = "AES-GCM";

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyData = Buffer.from(env.encryptionKey, "base64");
  return crypto.subtle.importKey("raw", keyData, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptProviderKey(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return Buffer.from(combined).toString("base64");
}

export async function decryptProviderKey(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Buffer.from(encrypted, "base64");

  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

export function getKeyHint(apiKey: string): string {
  // Return last 4 characters as hint
  return `...${apiKey.slice(-4)}`;
}
