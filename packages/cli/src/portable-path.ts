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

export function isUnsafePortablePathSegment(segment: string): boolean {
  return (
    WINDOWS_INVALID_PATH_CHARACTER.test(segment) ||
    WINDOWS_DEVICE_NAME.test(segment) ||
    hasControlText(segment) ||
    segment.endsWith('.') ||
    segment.endsWith(' ')
  )
}

export function portablePathComparisonKey(value: string): string {
  return value.normalize('NFC').toUpperCase().normalize('NFC')
}
