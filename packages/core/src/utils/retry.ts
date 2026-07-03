import { isFigmaApiError, getRetryAfter } from './errorHelpers'

/**
 * Options for configuring retry behavior.
 *
 * @public
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts.
   * @defaultValue 3
   */
  maxRetries?: number
  /**
   * Initial delay in milliseconds before the first retry.
   * @defaultValue 1000
   */
  initialDelayMs?: number
  /**
   * Multiplier for exponential backoff between retries.
   * @defaultValue 2
   */
  backoffMultiplier?: number
  /**
   * Maximum delay in milliseconds between retries.
   * @defaultValue 30000
   */
  maxDelayMs?: number
  /**
   * Set to `true` to retry rate limit errors (429) and reject other errors.
   * Set to `false` to retry any error.
   * @defaultValue true
   */
  retryOnlyRateLimits?: boolean
  /**
   * Function that runs before each retry attempt.
   * Use it for logging or UI state updates.
   */
  onRetry?: (attempt: number, delayMs: number, error: Error) => void
}

/**
 * Wrap an async function with retry and exponential backoff.
 *
 * @remarks
 * `withRetry` retries Figma HTTP 429 errors by default. A `Retry-After`
 * response value replaces the backoff delay.
 *
 * @param fn - The async function to wrap with retry logic
 * @param options - Configuration for retry behavior
 * @returns Wrapped function with retry behavior
 *
 * @example
 * ```ts
 * import { withRetry, fetcher } from '@primitree/core';
 *
 * const fetchWithRetry = withRetry(
 *   () => fetcher(url, token),
 *   { maxRetries: 3, onRetry: (attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`) }
 * );
 *
 * const data = await fetchWithRetry();
 * ```
 *
 * @public
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): () => Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 30000,
    retryOnlyRateLimits = true,
    onRetry,
  } = options ?? {}

  return async (): Promise<T> => {
    let lastError: Error | undefined
    let currentDelay = initialDelayMs

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        const error = err as Error
        lastError = error

        // Check if we should retry
        const isRateLimit = isFigmaApiError(error) && error.statusCode === 429
        const shouldRetry = retryOnlyRateLimits ? isRateLimit : true

        // Don't retry if we've exhausted attempts or shouldn't retry this error
        if (attempt >= maxRetries || !shouldRetry) {
          throw error
        }

        // Calculate delay: use Retry-After header if available, otherwise use backoff
        let delayMs = currentDelay
        const retryAfter = getRetryAfter(error)
        if (retryAfter !== null) {
          // Retry-After is in seconds, convert to milliseconds
          delayMs = retryAfter * 1000
        }

        // Cap delay at maxDelayMs
        delayMs = Math.min(delayMs, maxDelayMs)

        // Invoke callback if provided
        if (onRetry) {
          onRetry(attempt + 1, delayMs, error)
        }

        // Wait before retrying
        await sleep(delayMs)

        // Increase delay for next attempt (exponential backoff)
        currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs)
      }
    }

    // This should never be reached, but TypeScript needs it
    /* c8 ignore next */
    throw lastError ?? new Error('Retry failed')
  }
}

/**
 * Sleep for a specified number of milliseconds.
 * @internal
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
