import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const APPROVED_REFERENCE_PATHS = new Set([
  'apps/docs/content/docs/hooks/migration.mdx',
  'docs/releasing.md',
  'docs/launch/v1.0.0.md',
  'docs/plans/2026-07-28-primitree-clean-break-implementation.md',
  'packages/hooks/CHANGELOG.md',
  'packages/hooks/README.md',
  'scripts/check-release.mjs',
  'scripts/check-release.test.mjs',
  'scripts/check-brand.test.mjs',
])
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.superpowers',
  '.next',
  '.turbo',
  'artifacts',
  'coverage',
  'dist',
  'node_modules',
])
const BRAND_PATTERN =
  /@figma[-]vars\/hooks(?:@\d+\.\d+\.\d+)?|@figma[-]vars\/|@figma(?:vars)\/|figma(?:[-_]|)vars|--[\w-]*fv-[\w-]+|\b(?:bg|text|border|ring|fill|stroke)-fv-[\w-]+/gi

function normalizePath(path) {
  return path.replaceAll('\\', '/')
}

function isFormerScopeGuard(line) {
  return (
    (/\bFORMER_PACKAGE_SCOPES\b/.test(line) ||
      /\bformer-scope\b/i.test(line) ||
      /\bfor \(const scope of\b/.test(line)) &&
    /@figma[-]vars\/|@figma(?:vars)\//i.test(line)
  )
}

function isApprovedReference(path, line, match) {
  if (!APPROVED_REFERENCE_PATHS.has(path)) return false
  if (/^@figma[-]vars\/hooks(?:@\d+\.\d+\.\d+)?$/i.test(match)) {
    return true
  }
  return /^@figma(?:[-]vars|vars)\/$/i.test(match) && isFormerScopeGuard(line)
}

function matchesIn(value) {
  return Array.from(value.matchAll(BRAND_PATTERN), entry => entry[0])
}

export function findBrandViolations(records) {
  const violations = []

  for (const record of records) {
    const path = normalizePath(record.path)
    for (const match of matchesIn(path)) {
      violations.push({ path, line: null, match })
    }
    if (record.content === null) continue

    for (const [index, line] of record.content.split(/\r?\n/).entries()) {
      for (const match of matchesIn(line)) {
        if (!isApprovedReference(path, line, match)) {
          violations.push({ path, line: index + 1, match })
        }
      }
    }
  }

  return violations
}

function isTextFile(buffer) {
  return !buffer.includes(0)
}

export function readBrandRecords(repositoryRoot) {
  const root = resolve(repositoryRoot)
  const records = []

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const absolutePath = resolve(directory, entry.name)
      const path = normalizePath(relative(root, absolutePath))

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue

      const buffer = readFileSync(absolutePath)
      records.push({
        path,
        content: isTextFile(buffer) ? buffer.toString('utf8') : null,
      })
    }
  }

  visit(root)
  return records
}
