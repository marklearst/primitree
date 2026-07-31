/**
 * Naming helpers for the DTCG emitter and pipeline generators.
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
  const nextSuffix = new Map<string, number>()
  return items.map(item => {
    const base = slugify(getName(item))
    let candidate = base
    let suffix = nextSuffix.get(base) ?? 2
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    nextSuffix.set(base, suffix)
    used.add(candidate)
    return candidate
  })
}

/**
 * Return unique slugs for a list of names. Collisions receive `-2`, `-3`,
 * and later suffixes.
 *
 * @public
 */
export function uniqueSlugs(names: string[]): Map<string, string> {
  const slugs = allocateUniqueSlugs(names, name => name)
  const result = new Map<string, string>()
  for (const [index, name] of names.entries()) {
    result.set(name, slugs[index] as string)
  }
  return result
}
