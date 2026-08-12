const WINDOWS_INVALID_PATH_CHARACTER = /[<>:"|?*]/u
const WINDOWS_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu

function hasControlText(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

export function hasLoneUtf16Surrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

export function isUnsafePortablePathSegment(segment: string): boolean {
  return (
    WINDOWS_INVALID_PATH_CHARACTER.test(segment) ||
    WINDOWS_DEVICE_NAME.test(segment) ||
    hasControlText(segment) ||
    hasLoneUtf16Surrogate(segment) ||
    segment.endsWith('.') ||
    segment.endsWith(' ')
  )
}

export function portablePathComparisonKey(value: string): string {
  return value.normalize('NFC').toLowerCase().toUpperCase().normalize('NFC')
}
