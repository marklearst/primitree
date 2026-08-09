/**
 * Reports a token value that CSS output cannot represent.
 *
 * @public
 */
export class DTCGOutputCapabilityError extends Error {
  /** Output kind that rejected the value. */
  public readonly format: 'css'
  /** Dot path of the token that the output could not include. */
  public readonly tokenPath: string

  public constructor(format: 'css', tokenPath: string, type: string) {
    super(
      `The CSS output cannot represent the ${type} value at "${tokenPath}".`
    )
    this.name = 'DTCGOutputCapabilityError'
    this.format = format
    this.tokenPath = tokenPath
  }
}
