import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import postcss from 'postcss'

const APPROVED_REFERENCE_PATHS = new Set([
  'apps/docs/content/docs/hooks/migration.mdx',
  'docs/releasing.md',
  'docs/launch/v1.0.0-next.0.md',
  'docs/launch/v1.0.0-next.1.md',
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
  '.impeccable',
  '.review-state',
  '.next',
  '.turbo',
  'artifacts',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])
const BRAND_PATTERN =
  /@figma[-]vars\/hooks(?:@\d+\.\d+\.\d+)?|@figma[-]vars\/|@figma(?:vars)\/|figma(?:[-_]|)vars|--[\w-]*fv-[\w-]+|\b(?:bg|text|border|ring|fill|stroke)-fv-[\w-]+/gi
const SITE_STYLES_PATH = 'apps/docs/app/global.css'
const HOMEPAGE_STYLES_PATH = 'apps/docs/components/landing/home.css'
const TOKEN_GRAPH_PATH = 'apps/docs/components/landing/token-graph.tsx'
const GENERATED_TOKENS_IMPORT = '../tokens/generated/tokens.css'
const GENERATED_TOKENS_PREFIX = 'apps/docs/tokens/generated/'
const COLOR_CONTRACT_PATHS = new Set([
  'README.md',
  SITE_STYLES_PATH,
  HOMEPAGE_STYLES_PATH,
  TOKEN_GRAPH_PATH,
  'apps/docs/components/playground/playground.css',
  'apps/docs/public/favicon.svg',
  'apps/docs/public/primitree-icon.svg',
])
const COLOR_UI_PREFIXES = ['apps/docs/', 'apps/playground/']
const COLOR_UI_SOURCE_PATTERN = /\.(?:css|html|svg|[cm]?[jt]sx?)$/u
const TEST_SOURCE_PATTERN = /(?:^|\/)(?:__tests__|tests?)\/|\.(?:spec|test)\./u
const FORMER_BRAND_COLOR_PATTERN =
  /#(?:8b9cff|6d82ff|c7d2fe|a78bfa|7b8cff|5e70ff|b18cff|3ddc97|ffb454|ff6b81|a8c95f|5f7f2f|dde9b9|45c98b|f2b84b|f27575)(?:[\da-f]{2})?(?![\da-f])|rgba?\(\s*(?:139(?:\s*,\s*|\s+)156(?:\s*,\s*|\s+)255|123(?:\s*,\s*|\s+)140(?:\s*,\s*|\s+)255|61(?:\s*,\s*|\s+)220(?:\s*,\s*|\s+)151|255(?:\s*,\s*|\s+)180(?:\s*,\s*|\s+)84|255(?:\s*,\s*|\s+)107(?:\s*,\s*|\s+)129|168(?:\s*,\s*|\s+)201(?:\s*,\s*|\s+)95|69(?:\s*,\s*|\s+)201(?:\s*,\s*|\s+)139|242(?:\s*,\s*|\s+)184(?:\s*,\s*|\s+)75|242(?:\s*,\s*|\s+)117(?:\s*,\s*|\s+)117)[^)]*\)/gi
const FORMER_BADGE_COLOR_PATTERN =
  /img\.shields\.io\/badge\/[^)\s]*-((?:8b9cff|6d82ff|c7d2fe|a78bfa|7b8cff|5e70ff|b18cff|3ddc97|ffb454|ff6b81|a8c95f|5f7f2f|dde9b9|45c98b|f2b84b|f27575)(?:[\da-f]{2})?)(?=[)\s]|$)/gi
/** The alias each site role must hold. A theme re-aliases the semantic layer,
 * so a role that names a semantic token follows every theme and the dial. */
const APPROVED_CSS_VARIABLES = new Map([
  [
    SITE_STYLES_PATH,
    new Map([
      ['--color-primitree-bg', 'var(--semantic-surface-page)'],
      ['--color-primitree-surface', 'var(--semantic-surface-raised)'],
      ['--color-primitree-raised', 'var(--semantic-surface-sunken)'],
      ['--color-primitree-elevated', 'var(--semantic-surface-sunken)'],
      ['--color-primitree-border', 'var(--semantic-border-subtle)'],
      ['--color-primitree-border-strong', 'var(--semantic-border-strong)'],
      ['--color-primitree-edge', 'var(--semantic-border-strong)'],
      ['--color-primitree-text', 'var(--semantic-text-primary)'],
      ['--color-primitree-muted', 'var(--semantic-text-muted)'],
      ['--color-primitree-dim', 'var(--semantic-text-muted)'],
      ['--color-primitree-accent', 'var(--semantic-accent-text)'],
      ['--color-primitree-accent-strong', 'var(--semantic-accent-solid)'],
      ['--color-primitree-accent-soft', 'var(--semantic-accent-solidHover)'],
      ['--color-primitree-accent-ink', 'var(--semantic-text-onAccent)'],
      ['--color-primitree-accent-fill', 'var(--semantic-accent-solid)'],
      [
        '--color-primitree-accent-fill-hover',
        'var(--semantic-accent-solidHover)',
      ],
      ['--color-primitree-accent-wash', 'var(--semantic-accent-subtle)'],
      ['--color-primitree-good', 'var(--semantic-accent-text)'],
      ['--color-primitree-warn', 'var(--semantic-status-warn)'],
      ['--color-primitree-error', 'var(--semantic-status-fail)'],
      ['--color-primitree-error-ink', 'var(--semantic-text-onAccent)'],
      ['--color-primitree-tint-pass', 'var(--semantic-accent-subtle)'],
      ['--color-primitree-tint-fail', 'var(--semantic-status-failSubtle)'],
      ['--color-primitree-hover-wash', 'var(--semantic-surface-raised)'],
      ['--font-sans', 'var(--semantic-type-body-fontFamily)'],
      ['--font-mono', 'var(--semantic-type-code-fontFamily)'],
      ['--color-fd-background', 'var(--color-primitree-bg)'],
      ['--color-fd-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-muted', 'var(--color-primitree-surface)'],
      ['--color-fd-muted-foreground', 'var(--color-primitree-muted)'],
      ['--color-fd-popover', 'var(--color-primitree-raised)'],
      ['--color-fd-popover-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-card', 'var(--color-primitree-surface)'],
      ['--color-fd-card-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-primary', 'var(--color-primitree-accent)'],
      ['--color-fd-primary-foreground', 'var(--color-primitree-bg)'],
      ['--color-fd-secondary', 'var(--color-primitree-raised)'],
      ['--color-fd-secondary-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-accent', 'var(--color-primitree-accent-wash)'],
      ['--color-fd-accent-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-border', 'var(--color-primitree-border)'],
      ['--color-fd-ring', 'var(--color-primitree-text)'],
      ['--color-fd-success', 'var(--color-primitree-good)'],
      ['--color-fd-warning', 'var(--color-primitree-warn)'],
      ['--color-fd-error', 'var(--color-primitree-error)'],
    ]),
  ],
])
const APPROVED_SELECTION_BACKGROUND = 'var(--semantic-accent-subtle)'
const APPROVED_SVG_FILLS = new Map([
  ['apps/docs/public/favicon.svg', '#429c5a'],
  ['apps/docs/public/primitree-icon.svg', '#ffffff'],
])
/** The graph's states, each drawn from the graph's own tokens. A broken
 * reference has to read as the failure it is, in both themes. */
const APPROVED_GRAPH_TREATMENTS = [
  {
    label: 'lit lineage edge',
    property: 'fill-opacity',
    selector: '.graph-svg .graph-edge.is-lit',
    value: '1',
  },
  {
    label: 'fail-colored broken reference',
    property: '--edge-color',
    selector: '.graph-svg .graph-break',
    value: 'var(--component-graph-fail)',
  },
  {
    label: 'lit node outline',
    property: 'stroke',
    selector: '.graph-node.is-lit .node-swatch',
    value: 'var(--component-graph-lit)',
  },
  {
    label: 'node focus outline',
    property: 'stroke',
    selector: '.graph-node:focus-visible > *',
    value: 'var(--component-focus-ring)',
  },
]
const NO_LITERAL_STYLESHEETS = new Set([SITE_STYLES_PATH, HOMEPAGE_STYLES_PATH])
const CSS_NAMED_COLORS = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
]
/** Hex, color functions, and named colors. Relative color syntax derives from
 * another color, so `oklch(from var(--token) ...)` is not a literal, and
 * `transparent` and `currentcolor` carry no hue of their own. */
const COLOR_LITERAL_PATTERN = new RegExp(
  `#[\\da-f]{3,8}(?![\\w-])|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\((?!\\s*from\\b)|(?<![\\w-])(?:${CSS_NAMED_COLORS.join('|')})(?![\\w(-])`,
  'giu'
)
const CSS_MASK_PROPERTY_PATTERN = /^(?:-webkit-)?mask(?:-image)?$/u
const CSS_STRING_PATTERN = /"[^"]*"|'[^']*'/gu
const TOKEN_PROPERTY_PATTERN = /^--(?:primitives|semantic|component)-/u
const PRIMITIVE_READ_PATTERN = /--primitives-[\w-]+/u
const SEMANTIC_ALIAS_PATTERN = /^var\(--semantic-[\w-]+\)$/u

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
  if (!APPROVED_REFERENCE_PATHS.has(path)) {
    return false
  }
  if (/^@figma[-]vars\/hooks(?:@\d+\.\d+\.\d+)?$/i.test(match)) {
    return true
  }
  return /^@figma(?:[-]vars|vars)\/$/i.test(match) && isFormerScopeGuard(line)
}

function matchesIn(value) {
  return Array.from(value.matchAll(BRAND_PATTERN), entry => entry[0])
}

function lineFromOffset(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length
}

function normalizeColor(value) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'white') {
    return '#ffffff'
  }
  if (normalized === 'black') {
    return '#000000'
  }
  if (/^#[\da-f]{3}$/u.test(normalized)) {
    return `#${[...normalized.slice(1)].map(digit => digit.repeat(2)).join('')}`
  }
  return normalized
}

function readCssVariables(root) {
  const variables = new Map()

  root.walkDecls(declaration => {
    if (!declaration.prop.startsWith('--')) {
      return
    }
    const declarations = variables.get(declaration.prop) ?? []
    declarations.push({
      line: declaration.source?.start?.line ?? null,
      value: declaration.value.trim(),
    })
    variables.set(declaration.prop, declarations)
  })

  return variables
}

function findSelectionBackgrounds(root) {
  const selections = []

  root.walkRules(rule => {
    if (!rule.selectors.some(selector => selector.includes('::selection'))) {
      return
    }
    for (const declaration of rule.nodes ?? []) {
      if (
        declaration.type !== 'decl' ||
        (declaration.prop !== 'background' &&
          declaration.prop !== 'background-color')
      ) {
        continue
      }
      selections.push({
        line: declaration.source?.start?.line ?? null,
        value: declaration.value,
      })
    }
  })

  return selections
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function normalizeCssSelector(value) {
  return value.trim().replace(/\s+/gu, ' ')
}

function findCssPropertyDeclarations(root, selector, property) {
  const declarations = []
  const selectorPattern = new RegExp(`${escapeRegExp(selector)}(?![\\w-])`, 'u')

  root.walkRules(rule => {
    const matchingSelectors = rule.selectors.filter(candidate =>
      selectorPattern.test(candidate)
    )
    if (matchingSelectors.length === 0) {
      return
    }

    for (const declaration of rule.nodes ?? []) {
      if (declaration.type === 'decl' && declaration.prop === property) {
        for (const matchingSelector of matchingSelectors) {
          declarations.push({
            important: declaration.important,
            selector: normalizeCssSelector(matchingSelector),
            value: declaration.value.trim().replace(/\s+/gu, ' '),
          })
        }
      }
    }
  })

  return declarations
}

function parseCss(violations, path, content) {
  try {
    return postcss.parse(content, { from: path })
  } catch (error) {
    violations.push({
      path,
      line:
        typeof error === 'object' &&
        error !== null &&
        'line' in error &&
        typeof error.line === 'number'
          ? error.line
          : null,
      match: 'CSS syntax must parse before checking the color contract',
    })
    return null
  }
}

/** Removes each call to one of `names`, nested parentheses included. */
function withoutCssCalls(value, names) {
  const call = new RegExp(`(?<![\\w-])(?:${names.join('|')})\\(`, 'giu')
  let kept = ''
  let index = 0

  for (;;) {
    call.lastIndex = index
    const match = call.exec(value)
    if (match === null) {
      return kept + value.slice(index)
    }

    kept += value.slice(index, match.index)
    let depth = 1
    let cursor = match.index + match[0].length
    while (cursor < value.length && depth > 0) {
      if (value[cursor] === '(') {
        depth += 1
      }
      if (value[cursor] === ')') {
        depth -= 1
      }
      cursor += 1
    }
    index = cursor
  }
}

function addFormerColorViolations(violations, path, content) {
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(FORMER_BRAND_COLOR_PATTERN)) {
      violations.push({ path, line: index + 1, match: match[0] })
    }
    for (const match of line.matchAll(FORMER_BADGE_COLOR_PATTERN)) {
      violations.push({
        path,
        line: index + 1,
        match: `badge color: ${match[1]}`,
      })
    }
  }
}

function addCssVariableViolations(violations, path, root) {
  const expectedVariables = APPROVED_CSS_VARIABLES.get(path)
  if (!expectedVariables || root === null) {
    return
  }

  const actualVariables = readCssVariables(root)
  for (const [name, expected] of expectedVariables) {
    const actual = actualVariables.get(name) ?? []
    const firstWrong = actual.find(
      declaration => declaration.value !== expected
    )
    if (actual.length > 0 && firstWrong === undefined) {
      continue
    }

    violations.push({
      path,
      line: firstWrong?.line ?? null,
      match: `${name}: expected ${expected}, found ${firstWrong?.value ?? 'missing'}`,
    })
  }

  for (const [name, declarations] of actualVariables) {
    if (!name.startsWith('--color-primitree-') || expectedVariables.has(name)) {
      continue
    }
    const firstWrong = declarations.find(
      declaration => !SEMANTIC_ALIAS_PATTERN.test(declaration.value)
    )
    if (firstWrong === undefined) {
      continue
    }

    violations.push({
      path,
      line: firstWrong.line,
      match: `${name}: expected a semantic alias, found ${firstWrong.value}`,
    })
  }

  const selections = findSelectionBackgrounds(root)
  const wrongSelection = selections.find(
    selection => selection.value.trim() !== APPROVED_SELECTION_BACKGROUND
  )
  if (selections.length > 0 && wrongSelection === undefined) {
    return
  }

  violations.push({
    path,
    line: wrongSelection?.line ?? null,
    match: `text selection: expected ${APPROVED_SELECTION_BACKGROUND}, found ${wrongSelection?.value ?? 'missing'}`,
  })
}

function addColorLiteralViolations(violations, path, root) {
  if (!NO_LITERAL_STYLESHEETS.has(path) || root === null) {
    return
  }

  root.walkDecls(declaration => {
    // A fallback inside var() only paints when the token is missing, and a
    // mask reads coverage, so its black never reaches the screen.
    const value = withoutCssCalls(declaration.value, ['var', 'url']).replace(
      CSS_STRING_PATTERN,
      ''
    )
    const scanned = CSS_MASK_PROPERTY_PATTERN.test(declaration.prop)
      ? value.replace(/\bblack\b/giu, '')
      : value
    for (const literal of scanned.matchAll(COLOR_LITERAL_PATTERN)) {
      violations.push({
        path,
        line: declaration.source?.start?.line ?? null,
        match: `color literal in ${declaration.prop}: ${literal[0].replace(/\($/u, '()')}`,
      })
    }
  })
}

function addTokenLayerViolations(violations, path, root) {
  if (root === null) {
    return
  }

  root.walkDecls(declaration => {
    const line = declaration.source?.start?.line ?? null
    if (TOKEN_PROPERTY_PATTERN.test(declaration.prop)) {
      violations.push({
        path,
        line,
        match: `site CSS redeclares a token: ${declaration.prop}`,
      })
    }
    const read = PRIMITIVE_READ_PATTERN.exec(declaration.value)
    if (read !== null) {
      violations.push({
        path,
        line,
        match: `site CSS reads a primitive: ${read[0]}`,
      })
    }
  })
}

function addGeneratedTokensImportViolation(violations, path, root) {
  if (path !== SITE_STYLES_PATH || root === null) {
    return
  }

  let imported = false
  root.walkAtRules('import', rule => {
    if (rule.params.replace(/['"]/gu, '') === GENERATED_TOKENS_IMPORT) {
      imported = true
    }
  })
  if (imported) {
    return
  }

  violations.push({
    path,
    line: null,
    match: `global.css must import ${GENERATED_TOKENS_IMPORT}`,
  })
}

function addSvgFillViolation(violations, path, content) {
  const expected = APPROVED_SVG_FILLS.get(path)
  if (!expected) {
    return
  }

  const fills = Array.from(
    content.matchAll(/\bfill=["']([^"']+)["']/gu),
    fill => ({
      line: lineFromOffset(content, fill.index ?? 0),
      value: normalizeColor(fill[1]),
    })
  ).filter(fill => fill.value !== 'none' && fill.value !== 'transparent')
  const wrongFills = fills.filter(fill => fill.value !== expected)

  if (fills.length === 0) {
    violations.push({
      path,
      line: null,
      match: `mark fill: expected ${expected}, found missing`,
    })
  }
  for (const fill of wrongFills) {
    violations.push({
      path,
      line: fill.line,
      match: `mark fill: expected ${expected}, found ${fill.value}`,
    })
  }

  const strokes = Array.from(
    content.matchAll(/\bstroke=["']([^"']+)["']/gu),
    stroke => ({
      line: lineFromOffset(content, stroke.index ?? 0),
      value: normalizeColor(stroke[1]),
    })
  ).filter(stroke => stroke.value !== 'none' && stroke.value !== 'transparent')
  for (const stroke of strokes) {
    violations.push({
      path,
      line: stroke.line,
      match: `mark stroke: expected none, found ${stroke.value}`,
    })
  }

  const cssPaint =
    /<style\b|\bstyle\s*=\s*["'][^"']*(?:fill|stroke)\s*:/iu.exec(content)
  if (cssPaint) {
    violations.push({
      path,
      line: lineFromOffset(content, cssPaint.index ?? 0),
      match: 'static mark must not override fill or stroke through CSS',
    })
  }

  const gradient = /<(?:linear|radial)Gradient\b/iu.exec(content)
  if (gradient) {
    violations.push({
      path,
      line: lineFromOffset(content, gradient.index ?? 0),
      match: 'static mark must use one solid fill',
    })
  }
}

function addTokenGraphMarkupViolations(violations, path, content) {
  if (path !== TOKEN_GRAPH_PATH) {
    return
  }

  if (!/\bclassName=['"]graph-node['"]/u.test(content)) {
    violations.push({
      path,
      line: null,
      match: 'token graph: missing structural node class',
    })
  }

  if (!/\bclassName=['"]graph-edge['"]/u.test(content)) {
    violations.push({
      path,
      line: null,
      match: 'token graph: missing structural edge class',
    })
  }
}

function addHomepageRegressionViolations(violations, path, content) {
  const isHomepageSource =
    path === SITE_STYLES_PATH ||
    path.startsWith('apps/docs/components/landing/')
  if (!isHomepageSource) {
    return
  }

  const bannedPatterns = [
    {
      label: 'retired mark glow',
      pattern: /(?:\.|className=['"])[\w -]*mark-glow/u,
    },
    {
      label: 'retired mark ring',
      pattern: /(?:\.|className=['"])[\w -]*mark-ring/u,
    },
    {
      // The rule retired a mark that tilted after the cursor from a listener on
      // the window. A listener on one element answers that element alone.
      label: 'global pointer tracking',
      pattern:
        /(?:^|[^\w$.])(?:(?:window|globalThis|self|document(?:\.(?:body|documentElement))?)\??\.)?addEventListener\(\s*['"](?:pointermove|mousemove)['"]/mu,
    },
    {
      label: 'retired token board',
      pattern:
        /--home-[\w-]+|\b(?:board-token|tree-edge|token-board|use-tree-trace|board-geometry|brand-example)\b/u,
    },
    {
      label: 'inline filter effect',
      pattern: /\b(?:backdropFilter|filter)\s*[:=]\s*['"{`]|\bbackdrop-blur\b/u,
    },
    {
      label: 'inline gradient text',
      pattern: /\b(?:WebkitBackgroundClip|backgroundClip)\b|\bbg-clip-text\b/u,
    },
  ]

  for (const banned of bannedPatterns) {
    const match = banned.pattern.exec(content)
    if (match === null) {
      continue
    }
    violations.push({
      path,
      line: lineFromOffset(content, match.index ?? 0),
      match: `homepage regression: ${banned.label}`,
    })
  }
}

function addGraphTreatmentViolations(violations, path, root) {
  if (path !== HOMEPAGE_STYLES_PATH || root === null) {
    return
  }

  for (const treatment of APPROVED_GRAPH_TREATMENTS) {
    const declarations = findCssPropertyDeclarations(
      root,
      treatment.selector,
      treatment.property
    )
    const exactDeclarations = declarations.filter(
      declaration => declaration.selector === treatment.selector
    )
    const hasConflictingPriorityDeclaration = declarations.some(
      declaration =>
        declaration.value !== treatment.value &&
        (declaration.important || declaration.selector !== treatment.selector)
    )
    if (
      exactDeclarations.at(-1)?.value === treatment.value &&
      !hasConflictingPriorityDeclaration
    ) {
      continue
    }
    violations.push({
      path,
      line: null,
      match: `token graph: missing ${treatment.label}`,
    })
  }
}

function addHomepageEffectViolations(violations, path, root) {
  if (!NO_LITERAL_STYLESHEETS.has(path) || root === null) {
    return
  }

  root.walkDecls(declaration => {
    const property = declaration.prop.toLowerCase()
    const line = declaration.source?.start?.line ?? null
    if (
      property === 'filter' ||
      property === 'backdrop-filter' ||
      property === '-webkit-backdrop-filter'
    ) {
      violations.push({
        path,
        line,
        match: 'homepage: blur and filter effects are prohibited',
      })
    }

    const clipsToText =
      (property === 'background' ||
        property === 'background-clip' ||
        property === '-webkit-background-clip') &&
      /(?<![\w-])text(?![\w-])/u.test(
        withoutCssCalls(declaration.value, ['var'])
      )
    const hidesTextFill =
      property === '-webkit-text-fill-color' &&
      /\btransparent\b/u.test(declaration.value)
    if (clipsToText || hidesTextFill) {
      violations.push({
        path,
        line,
        match: 'homepage: gradient text is prohibited',
      })
    }
  })
}

export function findBrandViolations(records) {
  const violations = []

  for (const record of records) {
    const path = normalizePath(record.path)
    for (const match of matchesIn(path)) {
      violations.push({ path, line: null, match })
    }
    if (record.content === null) {
      continue
    }

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

export function findLichenColorViolations(records) {
  const violations = []

  for (const record of records) {
    const path = normalizePath(record.path)
    const isUiSource =
      COLOR_CONTRACT_PATHS.has(path) ||
      (COLOR_UI_PREFIXES.some(prefix => path.startsWith(prefix)) &&
        COLOR_UI_SOURCE_PATTERN.test(path) &&
        !TEST_SOURCE_PATTERN.test(path))
    if (!isUiSource || record.content === null) {
      continue
    }

    const isSiteStylesheet =
      path.startsWith('apps/docs/') &&
      path.endsWith('.css') &&
      !path.startsWith(GENERATED_TOKENS_PREFIX)
    const cssRoot = isSiteStylesheet
      ? parseCss(violations, path, record.content)
      : null

    addFormerColorViolations(violations, path, record.content)
    addCssVariableViolations(violations, path, cssRoot)
    addColorLiteralViolations(violations, path, cssRoot)
    addTokenLayerViolations(violations, path, cssRoot)
    addGeneratedTokensImportViolation(violations, path, cssRoot)
    addSvgFillViolation(violations, path, record.content)
    addTokenGraphMarkupViolations(violations, path, record.content)
    addHomepageRegressionViolations(violations, path, record.content)
    addGraphTreatmentViolations(violations, path, cssRoot)
    addHomepageEffectViolations(violations, path, cssRoot)
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
      if (entry.isSymbolicLink()) {
        continue
      }
      const absolutePath = resolve(directory, entry.name)
      const path = normalizePath(relative(root, absolutePath))

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          visit(absolutePath)
        }
        continue
      }
      if (!entry.isFile()) {
        continue
      }

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
