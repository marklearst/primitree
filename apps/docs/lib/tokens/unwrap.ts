/** The value inside a library result, or a throw that carries its diagnostics.
 * A step name, when given, prefixes the message. */
export function unwrap<Value>(
  result:
    | { readonly ok: true; readonly value: Value }
    | {
        readonly ok: false
        readonly diagnostics: readonly { readonly message: string }[]
      },
  step?: string
): Value {
  if (!result.ok) {
    const message = result.diagnostics.map(item => item.message).join(' ')
    throw new Error(step === undefined ? message : `${step}: ${message}`)
  }
  return result.value
}
