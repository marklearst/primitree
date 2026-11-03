import darkTokens from '@/tokens/generated/resolved/dark-full.tokens.json' with { type: 'json' }
import lightTokens from '@/tokens/generated/resolved/light-full.tokens.json' with { type: 'json' }
import { checkDocument, documentWithBreaks } from './page-check-core'
import type { BreakId, Finding } from './page-store'

/** Loads on the first break, along with the library and the token documents. */
export async function checkWithBreaks(
  breaks: ReadonlySet<BreakId>,
  theme: 'light' | 'dark'
): Promise<readonly Finding[]> {
  const source = theme === 'dark' ? darkTokens : lightTokens
  return checkDocument(documentWithBreaks(source, breaks), breaks)
}
