/**
 * Redact a Figma Personal Access Token for safe logging.
 *
 * @remarks
 * This utility masks the middle portion of a token while preserving
 * the first and last few characters for identification. Useful for
 * debugging and logging without exposing sensitive credentials.
 *
 * @param token - The token to redact (can be null/undefined)
 * @param options - Optional configuration for redaction behavior
 * @returns The redacted token string, or a placeholder for empty/short tokens
 *
 * @example
 * ```ts
 * import { redactToken } from '@figma-vars/hooks/utils';
 *
 * console.log(redactToken('figd_abc123xyz789def456'));
 * // Output: 'figd_***...***456'
 *
 * console.log(redactToken(null));
 * // Output: '[no token]'
 * ```
 *
 * @public
 */
export interface RedactTokenOptions {
  /**
   * Number of characters to show at the start of the token.
   * @defaultValue 5
   */
  visibleStart?: number
  /**
   * Number of characters to show at the end of the token.
   * @defaultValue 3
   */
  visibleEnd?: number
  /**
   * Placeholder text for null/undefined tokens.
   * @defaultValue '[no token]'
   */
  emptyPlaceholder?: string
}

export function redactToken(
  token: string | null | undefined,
  options?: RedactTokenOptions
): string {
  const {
    visibleStart = 5,
    visibleEnd = 3,
    emptyPlaceholder = '[no token]',
  } = options ?? {}

  // Handle null/undefined/empty tokens
  if (!token) {
    return emptyPlaceholder
  }

  // Minimum length to apply redaction (start + end + at least 1 char to hide)
  const minLength = visibleStart + visibleEnd + 1

  // If token is too short to redact meaningfully, mask entirely
  if (token.length < minLength) {
    return '*'.repeat(token.length)
  }

  const start = token.slice(0, visibleStart)
  const end = token.slice(-visibleEnd)

  return `${start}***...***${end}`
}
