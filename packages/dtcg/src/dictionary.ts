export function createDictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Required for null-prototype dictionaries.
  return Object.prototype.hasOwnProperty.call(value, key)
}
