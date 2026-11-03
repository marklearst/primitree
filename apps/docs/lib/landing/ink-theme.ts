/* The homepage code theme. Shiki needs concrete colors, so each role takes a
   placeholder here, and CodePanel swaps the placeholder for the token's custom
   property. Keys and punctuation stay quiet, values carry the color, and alias
   references such as {primitives.color.brand.45} take the brand, so the thing
   Primitree checks stands out in every sample and follows the dial. */

export const ink = {
  panel: '#000001',
  base: '#000002',
  comment: '#000003',
  punct: '#000004',
  key: '#000005',
  string: '#000006',
  reference: '#000007',
  number: '#000008',
  keyword: '#000009',
} as const

/** The token each placeholder stands for. */
export const inkTokens: Readonly<Record<string, string>> = {
  [ink.base]: 'var(--semantic-syntax-base)',
  [ink.comment]: 'var(--semantic-syntax-comment)',
  [ink.punct]: 'var(--semantic-syntax-punctuation)',
  [ink.key]: 'var(--semantic-syntax-key)',
  [ink.string]: 'var(--semantic-syntax-string)',
  [ink.reference]: 'var(--semantic-syntax-reference)',
  [ink.number]: 'var(--semantic-syntax-number)',
  [ink.keyword]: 'var(--semantic-syntax-keyword)',
}

/** A TextMate theme for Shiki through fumadocs-core/highlight. */
export const inkTheme = {
  name: 'primitree-ink',
  type: 'dark' as const,
  colors: {
    'editor.background': ink.panel,
    'editor.foreground': ink.base,
  },
  settings: [
    { settings: { foreground: ink.base, background: ink.panel } },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: ink.comment },
    },
    {
      scope: [
        'punctuation',
        'meta.brace',
        'punctuation.separator',
        'punctuation.terminator',
        'meta.delimiter',
      ],
      settings: { foreground: ink.punct },
    },
    {
      scope: [
        'support.type.property-name',
        'meta.object-literal.key',
        'variable.other.property',
        'support.type.property-name.css',
        'variable.css',
      ],
      settings: { foreground: ink.key },
    },
    {
      // var(--semantic-accent-solid): the CSS form of an alias.
      scope: ['variable.argument.css'],
      settings: { foreground: ink.reference },
    },
    {
      scope: ['string', 'string.quoted', 'punctuation.definition.string'],
      settings: { foreground: ink.string },
    },
    {
      scope: ['constant.numeric', 'constant.language', 'keyword.other.unit'],
      settings: { foreground: ink.number },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.operator.expression',
      ],
      settings: { foreground: ink.keyword },
    },
    {
      scope: ['entity.name.function', 'support.function'],
      settings: { foreground: ink.base },
    },
  ],
}

/** Marks a JSON or TypeScript string that holds a DTCG alias, so CSS can
 * give it the reference color. */
export const REFERENCE_PATTERN = /^["']?\{[A-Za-z0-9$_.-]+\}["']?$/u
