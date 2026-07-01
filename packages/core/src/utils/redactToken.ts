/**
 * Options for masking part of a Figma token.
 *
 * @remarks
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

/**
 * Mask the middle of a Figma token for display.
 *
 * @remarks
 * Masked output contains visible token characters. Keep it out of logs,
 * analytics, and error reports.
 *
 * @param token - Token to mask.
 * @param options - Visible character counts and empty placeholder.
 * @returns Masked token or the configured placeholder.
 *
 * @example
 * ```ts
 * import { redactToken } from '@primitree/core'
 *
 * redactToken('figd_abc123xyz789def456')
 * // 'figd_***...***456'
 * ```
 *
 * @public
 */
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
