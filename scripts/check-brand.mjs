import { fileURLToPath } from 'node:url'
import { findBrandViolations, readBrandRecords } from './brand-rules.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const violations = findBrandViolations(readBrandRecords(repositoryRoot))

for (const violation of violations) {
  const location =
    violation.line === null
      ? violation.path
      : `${violation.path}:${violation.line}`
  console.error(`${location}: ${violation.match}`)
}

if (violations.length > 0) process.exitCode = 1
