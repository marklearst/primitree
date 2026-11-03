import type { BreakId } from './page-store.ts'

/* The four rules the homepage breaks: the edit each makes to a copy of the
   token document, and the code the check returns for it. The browser check,
   the CLI recording, and the rule rows read this one list. The owner rule
   edits the config, so it carries no document edit. */

export type TokenTree = Record<string, unknown>

export interface RuleBreak {
  readonly code: string
  readonly edit?: (document: TokenTree) => void
}

const valueAt = (tree: TokenTree, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (node, segment) => (node as TokenTree | undefined)?.[segment],
    tree
  )

function setAt(tree: TokenTree, path: readonly string[], value: unknown) {
  const last = path.at(-1)
  let group = tree
  for (const segment of path.slice(0, -1)) {
    group[segment] ??= {}
    group = group[segment] as TokenTree
  }
  if (last !== undefined) {
    group[last] = value
  }
}

/** The accent's raw value: the primitive its alias resolves to, as the
 * document holds it at the shipped hue. */
const accentValue = (document: TokenTree) =>
  valueAt(document, ['primitives', 'color', 'brand', '45', '$value'])

export const ruleBreaks: Readonly<Record<BreakId, RuleBreak>> = {
  literal: {
    code: 'PT1003',
    edit(document) {
      setAt(document, ['semantic', 'accent', 'solid'], {
        $type: 'color',
        $value: accentValue(document),
      })
    },
  },
  skip: {
    code: 'PT1004',
    edit(document) {
      setAt(document, ['component', 'link', 'text'], {
        $type: 'color',
        $value: '{primitives.color.brand.45}',
      })
    },
  },
  stray: {
    code: 'PT1001',
    edit(document) {
      setAt(document, ['brand', 'accent'], {
        $type: 'color',
        $value: accentValue(document),
      })
    },
  },
  owner: { code: 'PT1005' },
}
