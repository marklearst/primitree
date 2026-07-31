/**
 * Reports a token value or Resolver state that CSS output cannot represent.
 *
 * @public
 */
export class DTCGOutputCapabilityError extends Error {
  /** Output kind that rejected the value or state. */
  public readonly format: 'css'
  /** Dot path of the token that the output could not include. */
  public readonly tokenPath: string

  public constructor(
    format: 'css',
    tokenPath: string,
    type: string,
    reason: 'value' | 'token-state' = 'value'
  ) {
    super(
      reason === 'token-state'
        ? `The CSS output cannot represent token path "${tokenPath}" because it changes shape or disappears between Resolver states.`
        : `The CSS output cannot represent the ${type} value at "${tokenPath}".`
    )
    this.name = 'DTCGOutputCapabilityError'
    this.format = format
    this.tokenPath = tokenPath
  }
}
