import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import postcss from 'postcss'

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
const LICHEN_CONTRACT_PATHS = new Set([
  'README.md',
  'apps/docs/app/global.css',
  'apps/docs/components/landing/living-canopy.tsx',
  'apps/docs/components/playground/playground.css',
  'apps/docs/public/favicon.svg',
  'apps/docs/public/primitree-icon.svg',
  'apps/playground/public/favicon.svg',
  'apps/playground/src/assets/primitree-icon.svg',
  'apps/playground/src/styles.css',
])
const LICHEN_UI_PREFIXES = ['apps/docs/', 'apps/playground/']
const LICHEN_UI_SOURCE_PATTERN = /\.(?:css|html|svg|[cm]?[jt]sx?)$/u
const TEST_SOURCE_PATTERN = /(?:^|\/)(?:__tests__|tests?)\/|\.(?:spec|test)\./u
const FORMER_BRAND_COLOR_PATTERN =
  /#(?:8b9cff|6d82ff|c7d2fe|a78bfa|7b8cff|5e70ff|b18cff|34d399|fbbf24|3ddc97|ffb454|ff6b81)(?:[\da-f]{2})?(?![\da-f])|rgba?\(\s*(?:139(?:\s*,\s*|\s+)156(?:\s*,\s*|\s+)255|123(?:\s*,\s*|\s+)140(?:\s*,\s*|\s+)255|52(?:\s*,\s*|\s+)211(?:\s*,\s*|\s+)153|251(?:\s*,\s*|\s+)191(?:\s*,\s*|\s+)36|61(?:\s*,\s*|\s+)220(?:\s*,\s*|\s+)151|255(?:\s*,\s*|\s+)180(?:\s*,\s*|\s+)84|255(?:\s*,\s*|\s+)107(?:\s*,\s*|\s+)129)[^)]*\)/gi
const FORMER_BADGE_COLOR_PATTERN =
  /img\.shields\.io\/badge\/[^)\s]*-((?:8b9cff|6d82ff|c7d2fe|a78bfa|7b8cff|5e70ff|b18cff|34d399|fbbf24|3ddc97|ffb454|ff6b81)(?:[\da-f]{2})?)(?=[)\s]|$)/gi
const APPROVED_CSS_VARIABLES = new Map([
  [
    'apps/docs/app/global.css',
    new Map([
      ['--color-primitree-bg', '#030304'],
      ['--color-primitree-surface', '#08080a'],
      ['--color-primitree-raised', '#0f0f12'],
      ['--color-primitree-elevated', '#16161a'],
      ['--color-primitree-text', '#fafafa'],
      ['--color-primitree-accent', '#a8c95f'],
      ['--color-primitree-accent-strong', '#5f7f2f'],
      ['--color-primitree-accent-soft', '#dde9b9'],
      ['--color-primitree-accent-wash', 'rgb(168 201 95 / 10%)'],
      ['--color-primitree-good', '#45c98b'],
      ['--color-primitree-warn', '#f2b84b'],
      ['--color-primitree-error', '#f27575'],
      ['--color-fd-background', 'var(--color-primitree-bg)'],
      ['--color-fd-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-muted', 'var(--color-primitree-surface)'],
      ['--color-fd-muted-foreground', 'var(--color-primitree-muted)'],
      ['--color-fd-popover', 'var(--color-primitree-raised)'],
      ['--color-fd-popover-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-card', 'var(--color-primitree-surface)'],
      ['--color-fd-card-foreground', 'var(--color-primitree-text)'],
      ['--color-fd-primary', 'var(--color-primitree-accent)'],
      ['--color-fd-primary-foreground', '#09090b'],
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
  [
    'apps/playground/src/styles.css',
    new Map([
      ['--bg', '#030304'],
      ['--bg-surface', '#08080a'],
      ['--bg-raised', '#0f0f12'],
      ['--bg-hover', '#16161a'],
      ['--text', '#fafafa'],
      ['--accent', '#a8c95f'],
      ['--accent-strong', '#5f7f2f'],
      ['--accent-soft', '#dde9b9'],
      ['--accent-wash', 'rgb(168 201 95 / 10%)'],
      ['--good', '#45c98b'],
      ['--warn', '#f2b84b'],
      ['--error', '#f27575'],
    ]),
  ],
])
const APPROVED_SVG_FILLS = new Map([
  ['apps/docs/public/favicon.svg', '#5f7f2f'],
  ['apps/docs/public/primitree-icon.svg', '#ffffff'],
  ['apps/playground/public/favicon.svg', '#5f7f2f'],
  ['apps/playground/src/assets/primitree-icon.svg', '#ffffff'],
])

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

function lineFromOffset(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length
}

function normalizeColor(value) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'white') return '#ffffff'
  if (normalized === 'black') return '#000000'
  if (/^#[\da-f]{3}$/u.test(normalized)) {
    return `#${[...normalized.slice(1)].map(digit => digit.repeat(2)).join('')}`
  }
  return normalized
}

function readCssVariables(root) {
  const variables = new Map()

  root.walkDecls(declaration => {
    if (!declaration.prop.startsWith('--')) return
    const declarations = variables.get(declaration.prop) ?? []
    declarations.push({
      line: declaration.source?.start?.line ?? null,
      value: normalizeColor(declaration.value),
    })
    variables.set(declaration.prop, declarations)
  })

  return variables
}

function functionalColor(value) {
  const match = value
    .trim()
    .toLowerCase()
    .match(
      /^rgba?\(\s*(\d+)(?:\s*,\s*|\s+)(\d+)(?:\s*,\s*|\s+)(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/u
    )
  if (!match) return null

  const alpha =
    match[4] === undefined
      ? 1
      : match[4].endsWith('%')
        ? Number.parseFloat(match[4]) / 100
        : Number.parseFloat(match[4])

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
    alpha,
  ]
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
    if (matchingSelectors.length === 0) return

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
      match: 'CSS syntax must parse before checking the Lichen color contract',
    })
    return null
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
  if (!expectedVariables || root === null) return

  const actualVariables = readCssVariables(root)
  for (const [name, expected] of expectedVariables) {
    const actual = actualVariables.get(name) ?? []
    const firstWrong = actual.find(
      declaration => declaration.value !== expected
    )
    if (actual.length > 0 && firstWrong === undefined) continue

    violations.push({
      path,
      line: firstWrong?.line ?? null,
      match: `${name}: expected ${expected}, found ${firstWrong?.value ?? 'missing'}`,
    })
  }

  const selections = findSelectionBackgrounds(root)
  const wrongSelection = selections.find(selection => {
    const color = functionalColor(selection.value)
    return !(
      color?.[0] === 168 &&
      color[1] === 201 &&
      color[2] === 95 &&
      color[3] === 0.25
    )
  })
  if (selections.length > 0 && wrongSelection === undefined) return

  violations.push({
    path,
    line: wrongSelection?.line ?? null,
    match: `text selection: expected rgb(168 201 95 / 25%), found ${wrongSelection?.value ?? 'missing'}`,
  })
}

function addSvgFillViolation(violations, path, content) {
  const expected = APPROVED_SVG_FILLS.get(path)
  if (!expected) return

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

function addLivingCanopyMarkupViolations(violations, path, content) {
  if (path !== 'apps/docs/components/landing/living-canopy.tsx') return

  const body =
    /<path\b(?=[^>]*\bclassName=['"]canopy-logo-body['"])[^>]*>/u.exec(content)
  const fill = body && /\bfill=['"]([^'"]+)['"]/u.exec(body[0])
  const actual = fill?.[1] ?? null
  if (actual !== 'var(--color-primitree-text)') {
    const offset =
      body && fill ? (body.index ?? 0) + (fill.index ?? 0) : (body?.index ?? 0)
    violations.push({
      path,
      line: body ? lineFromOffset(content, offset) : null,
      match: `living canopy mark: expected Bone body, found ${actual ?? 'missing'}`,
    })
  }

  if (!/\bclassName=['"]canopy-root-node['"]/u.test(content)) {
    violations.push({
      path,
      line: null,
      match: 'living canopy mark: missing structural Lichen root node',
    })
  }
}

function addHomepageRegressionViolations(violations, path, content) {
  const isHomepageSource =
    path === 'apps/docs/app/global.css' ||
    path.startsWith('apps/docs/components/landing/')
  if (!isHomepageSource) return

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
      label: 'global pointer tracking',
      pattern: /addEventListener\(\s*['"]pointermove['"]/u,
    },
    {
      label: 'infinite homepage animation',
      pattern: /\banimation\s*:[^;\n]*\binfinite\b/u,
    },
    {
      label: 'infinite homepage animation',
      pattern: /animationIterationCount\s*:\s*['"]infinite['"]/u,
    },
  ]

  for (const banned of bannedPatterns) {
    const match = banned.pattern.exec(content)
    if (match === null) continue
    violations.push({
      path,
      line: lineFromOffset(content, match.index ?? 0),
      match: `living canopy regression: ${banned.label}`,
    })
  }
}

function addLivingCanopyStyleViolations(violations, path, root) {
  if (path !== 'apps/docs/app/global.css' || root === null) return

  const expectedTreatments = [
    {
      label: 'Bone logo body',
      property: 'fill',
      selector: '.canopy-logo-body',
      value: 'var(--color-primitree-text)',
    },
    {
      label: 'Lichen root node',
      property: 'fill',
      selector: '.canopy-root-node',
      value: 'var(--color-primitree-accent)',
    },
    {
      label: 'Lichen structural trunk',
      property: 'stroke',
      selector: '.canopy-trunk',
      value: 'var(--color-primitree-accent)',
    },
    {
      label: 'Lichen governed-token border',
      property: 'stroke',
      selector: '.canopy-token-node rect',
      value: 'var(--color-primitree-accent)',
    },
  ]

  for (const treatment of expectedTreatments) {
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
      match: `living canopy: missing ${treatment.label}`,
    })
  }

  root.walkRules(rule => {
    if (
      !rule.selectors.some(
        selector =>
          selector.includes('.canopy') || selector.includes('.governance-')
      )
    ) {
      return
    }

    for (const declaration of rule.nodes ?? []) {
      if (declaration.type !== 'decl') continue
      const usesAtmosphericEffect =
        declaration.prop === 'filter' ||
        declaration.prop === 'backdrop-filter' ||
        /gradient\(|\binfinite\b/u.test(declaration.value)
      if (!usesAtmosphericEffect) continue

      violations.push({
        path,
        line: declaration.source?.start?.line ?? null,
        match:
          'living canopy: gradients, blur, and infinite motion are prohibited',
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

export function findLichenColorViolations(records) {
  const violations = []

  for (const record of records) {
    const path = normalizePath(record.path)
    const isUiSource =
      LICHEN_CONTRACT_PATHS.has(path) ||
      (LICHEN_UI_PREFIXES.some(prefix => path.startsWith(prefix)) &&
        LICHEN_UI_SOURCE_PATTERN.test(path) &&
        !TEST_SOURCE_PATTERN.test(path))
    if (!isUiSource || record.content === null) continue

    const needsCssContract =
      APPROVED_CSS_VARIABLES.has(path) || path === 'apps/docs/app/global.css'
    const cssRoot = needsCssContract
      ? parseCss(violations, path, record.content)
      : null

    addFormerColorViolations(violations, path, record.content)
    addCssVariableViolations(violations, path, cssRoot)
    addSvgFillViolation(violations, path, record.content)
    addLivingCanopyMarkupViolations(violations, path, record.content)
    addHomepageRegressionViolations(violations, path, record.content)
    addLivingCanopyStyleViolations(violations, path, cssRoot)
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
