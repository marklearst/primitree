type CapabilityFormat = 'css' | 'tailwind'
type CapabilityReason = 'value' | 'token-state' | 'tailwind-namespace'

function capabilityMessage(
  format: CapabilityFormat,
  tokenPath: string,
  type: string,
  reason: CapabilityReason
): string {
  const valid =
    (format === 'css' && (reason === 'value' || reason === 'token-state')) ||
    (format === 'tailwind' && reason === 'tailwind-namespace')
  if (!valid) {
    throw new TypeError(
      `The ${reason} capability reason is not valid for ${format} output.`
    )
  }
  if (reason === 'tailwind-namespace') {
    return `The Tailwind output cannot represent token path "${tokenPath}" because its theme namespace changes or disappears between Resolver states.`
  }
  return reason === 'token-state'
    ? `The CSS output cannot represent token path "${tokenPath}" because it changes shape or disappears between Resolver states.`
    : `The CSS output cannot represent the ${type} value at "${tokenPath}".`
}

/** Reports a token value or Resolver state that an output cannot represent. @public */
export class DTCGOutputCapabilityError extends Error {
  /** Output kind that rejected the value or state. */
  public readonly format: 'css' | 'tailwind'
  /** Dot path of the token that the output could not include. */
  public readonly tokenPath: string

  public constructor(
    format: 'css',
    tokenPath: string,
    type: string,
    reason?: 'value' | 'token-state'
  )
  public constructor(
    format: 'tailwind',
    tokenPath: string,
    type: string,
    reason: 'tailwind-namespace'
  )
  public constructor(
    format: CapabilityFormat,
    tokenPath: string,
    type: string,
    reason: CapabilityReason = 'value'
  ) {
    super(capabilityMessage(format, tokenPath, type, reason))
    this.name = 'DTCGOutputCapabilityError'
    this.format = format
    this.tokenPath = tokenPath
  }
}
