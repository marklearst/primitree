import type { NormalizedVariable } from '@figmavars/core'
import type { DTCGTokenType } from './types'

const DIMENSION_SCOPES = new Set([
  'CORNER_RADIUS',
  'WIDTH_HEIGHT',
  'GAP',
  'STROKE_FLOAT',
  'FONT_SIZE',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
])

const DIMENSION_NAME =
  /radius|size|space|spacing|gap|width|height|border|stroke|inset|padding|margin|breakpoint/i
const FONT_WEIGHT_NAME = /weight/i
const NUMBER_NAME = /opacity|alpha|scale|ratio|z-?index|elevation|line-?height/i
const DURATION_NAME = /duration|delay|time/i
const FONT_FAMILY_NAME = /font[-/ ]?famil|typeface/i

/**
 * Infer the DTCG `$type` for a Figma variable using its resolved type,
 * scopes, and (as a fallback) naming conventions.
 *
 * @remarks
 * Heuristics for `FLOAT` variables:
 *
 * 1. Scopes win: `OPACITY`/`EFFECT_FLOAT` → `number`, `FONT_WEIGHT` →
 *    `fontWeight`, `LINE_HEIGHT` → `number`, sizing scopes → `dimension`.
 * 2. Otherwise the variable name decides (`radius`, `space`, `gap`, ... →
 *    `dimension`; `duration` → `duration`; `weight` → `fontWeight`; ...).
 * 3. Defaults to `number`.
 *
 * @public
 */
export function inferTokenType(variable: NormalizedVariable): DTCGTokenType {
  switch (variable.resolvedType) {
    case 'COLOR':
      return 'color'
    case 'BOOLEAN':
      return 'boolean'
    case 'STRING': {
      if (
        variable.scopes.includes('FONT_FAMILY') ||
        FONT_FAMILY_NAME.test(variable.name)
      ) {
        return 'fontFamily'
      }
      return 'string'
    }
    case 'FLOAT': {
      const scopes = new Set<string>(variable.scopes)
      if (scopes.has('OPACITY') || scopes.has('EFFECT_FLOAT')) {
        return 'number'
      }
      if (scopes.has('FONT_WEIGHT')) {
        return 'fontWeight'
      }
      if (scopes.has('LINE_HEIGHT')) {
        return 'number'
      }
      for (const scope of scopes) {
        if (DIMENSION_SCOPES.has(scope)) {
          return 'dimension'
        }
      }
      if (DURATION_NAME.test(variable.name)) {
        return 'duration'
      }
      if (FONT_WEIGHT_NAME.test(variable.name)) {
        return 'fontWeight'
      }
      if (NUMBER_NAME.test(variable.name)) {
        return 'number'
      }
      if (DIMENSION_NAME.test(variable.name)) {
        return 'dimension'
      }
      return 'number'
    }
  }
}
