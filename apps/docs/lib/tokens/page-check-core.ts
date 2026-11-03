import { composeGraph, createSourceView } from '@primitree/core'
import { createPolicy, evaluatePolicy } from '@primitree/core/policy'
import { createDTCGGraphFragment } from '@primitree/dtcg'
import { ruleBreaks, type TokenTree } from './breaks.ts'
import type { BreakId, Finding } from './page-store.ts'
import {
  siteLayers,
  siteOwnership,
  siteOwnershipWithoutDefault,
} from './site-policy.ts'
import { unwrap } from './unwrap.ts'

/* The check behind "Break a rule". It runs the same public calls the CLI runs,
   so the finding on screen is the real one. tests/page-check.test.ts holds it
   against the CLI's own output. */

/** The token document with each break's edit applied. */
export function documentWithBreaks(
  source: unknown,
  breaks: ReadonlySet<BreakId>
): TokenTree {
  const document = structuredClone(source) as TokenTree
  for (const id of breaks) {
    ruleBreaks[id].edit?.(document)
  }
  return document
}

export function checkDocument(
  document: unknown,
  breaks: ReadonlySet<BreakId>
): readonly Finding[] {
  const fragment = unwrap(createDTCGGraphFragment(document, { source: 'site' }))
  const graph = unwrap(composeGraph([fragment]))
  const view = unwrap(createSourceView(graph, { id: 'site' }))
  const ownership = breaks.has('owner')
    ? siteOwnershipWithoutDefault
    : siteOwnership
  const policy = unwrap(
    createPolicy({ id: 'site', viewId: 'site', layers: siteLayers, ownership })
  )
  const report = unwrap(evaluatePolicy({ graph, view }, policy))
  return report.findings
    .filter(finding => finding.disposition === 'active')
    .map(finding => ({
      ruleId: finding.ruleId,
      path: finding.path.join('.'),
      message: finding.message,
      owners: finding.owners,
    }))
}
