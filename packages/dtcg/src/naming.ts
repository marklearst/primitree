/**
 * Naming helpers shared by the DTCG emitter and pipeline generators.
 */

const DANGEROUS_OBJECT_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
])

/**
 * Kebab-case slug for file names, resolver set/modifier names, and
 * collection group names.
 *
 * @public
 */
export function slugify(input: string): string {
  const slug = input
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug.length > 0 ? slug : 'unnamed'
}

/**
 * Sanitize one path segment according to DTCG name restrictions. Token names
 * cannot contain `{`, `}`, or `.`, and cannot start with `$`.
 *
 * @public
 */
export function sanitizeSegment(segment: string): string {
  const cleaned = segment.trim().replace(/[{}.]/g, '-').replace(/^\$+/, '')
  if (cleaned.length === 0) {
    return 'unnamed'
  }
  return DANGEROUS_OBJECT_SEGMENTS.has(cleaned) ? `_${cleaned}_` : cleaned
}

/**
 * Split a Figma variable name (`color/bg/brand`) into sanitized DTCG path
 * segments.
 *
 * @public
 */
export function toPathSegments(variableName: string): string[] {
  const segments = variableName
    .split('/')
    .map(sanitizeSegment)
    .filter(s => s.length > 0)
  return segments.length > 0 ? segments : ['unnamed']
}

/**
 * Allocate unique slugs while preserving each item's input position.
 *
 * @public
 */
export function allocateUniqueSlugs<T>(
  items: readonly T[],
  getName: (item: T) => string
): string[] {
  const used = new Set<string>()
  return items.map(item => {
    const base = slugify(getName(item))
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    used.add(candidate)
    return candidate
  })
}

/**
 * Produce unique slugs for a list of names, appending `-2`, `-3`, ... on
 * collision.
 *
 * @public
 */
export function uniqueSlugs(names: string[]): Map<string, string> {
  const used = new Map<string, number>()
  const result = new Map<string, string>()
  for (const name of names) {
    const base = slugify(name)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    result.set(name, count === 0 ? base : `${base}-${count + 1}`)
  }
  return result
}
