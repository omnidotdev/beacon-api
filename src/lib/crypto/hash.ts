// Compute SHA-256 content hash for memory deduplication

/**
 * Compute a SHA-256 hash of content for deduplication.
 * @param content - Raw content string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeContentHash(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
