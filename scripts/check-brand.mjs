import { fileURLToPath } from 'node:url'
import {
  findBrandViolations,
  findLichenColorViolations,
  readBrandRecords,
} from './brand-rules.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const records = readBrandRecords(repositoryRoot)
const violations = [
  ...findBrandViolations(records),
  ...findLichenColorViolations(records),
]

for (const violation of violations) {
  const location =
    violation.line === null
      ? violation.path
      : `${violation.path}:${violation.line}`
  console.error(`${location}: ${violation.match}`)
}

if (violations.length > 0) process.exitCode = 1
