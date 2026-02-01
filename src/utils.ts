/**
 * Shared utility functions for LogDot SDK
 */

/** Max message size to stay under 16KB API limit */
export const MAX_MESSAGE_BYTES = 16000;

/**
 * Truncate a string to fit within a byte limit, preserving valid UTF-8.
 *
 * Slices at a valid UTF-8 character boundary to avoid producing
 * replacement characters (U+FFFD) from split multi-byte sequences.
 */
export function truncateBytes(str: string, maxBytes: number = MAX_MESSAGE_BYTES): string {
  const encoded = new TextEncoder().encode(str);
  if (encoded.length <= maxBytes) return str;

  // Walk backwards from the cut point to find a valid UTF-8 boundary.
  // UTF-8 continuation bytes have the form 10xxxxxx (0x80..0xBF).
  let end = maxBytes;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) {
    end--;
  }

  return new TextDecoder().decode(encoded.slice(0, end)) + '... [truncated]';
}
