import { remark } from 'remark'
import remarkMdx from 'remark-mdx'

import { scanText } from './rules.mjs'
import { scanTypeScript } from './typescript.mjs'

const VISIBLE_MDX_ATTRIBUTES = new Set([
  'alt',
  'aria-label',
  'caption',
  'description',
  'eyebrow',
  'heading',
  'label',
  'note',
  'placeholder',
  'subtitle',
  'summary',
  'title',
  'tooltip',
])

const TECHNICAL_MDX_ATTRIBUTES = new Set([
  'as',
  'class',
  'classname',
  'code',
  'color',
  'defaultopen',
  'disabled',
  'height',
  'href',
  'icon',
  'id',
  'items',
  'kind',
  'lang',
  'language',
  'mode',
  'name',
  'open',
  'path',
  'rel',
  'role',
  'size',
  'slug',
  'src',
  'style',
  'target',
  'type',
  'value',
  'variant',
  'width',
])

const PROSE_BLOCKS = new Set(['heading', 'paragraph', 'tableCell'])

const DOC_CODE_LANGUAGES = new Map([
  ['js', 'js'],
  ['javascript', 'js'],
  ['jsx', 'jsx'],
  ['ts', 'ts'],
  ['typescript', 'ts'],
  ['tsx', 'tsx'],
])

function frontmatterRange(source) {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---') {
    return null
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---'
  )
  if (closingIndex === -1) {
    return null
  }

  return {
    lines,
    closingIndex,
  }
}

function scanFrontmatter(file, source) {
  const range = frontmatterRange(source)
  if (!range) {
    return []
  }

  const violations = []
  let blockScalarIndent = null

  for (let index = 1; index < range.closingIndex; index += 1) {
    const line = range.lines[index]
    const indent = line.length - line.trimStart().length
    const keyValue = line.match(/^\s*[^#][^:]*:\s*(.*)$/u)

    if (keyValue) {
      const value = keyValue[1].trim()
      blockScalarIndent = /^[>|][+-]?\d*$/u.test(value) ? indent : null

      if (!value || blockScalarIndent !== null) {
        continue
      }

      const valueColumn = line.indexOf(keyValue[1]) + 1
      violations.push(
        ...scanText(file, value.replace(/^['"]|['"]$/gu, ''), {
          startLine: index + 1,
          startColumn: valueColumn,
        })
      )
      continue
    }

    if (
      blockScalarIndent !== null &&
      line.trim() &&
      indent > blockScalarIndent
    ) {
      violations.push(
        ...scanText(file, line.trim(), {
          startLine: index + 1,
          startColumn: indent + 1,
        })
      )
    } else if (line.trim()) {
      blockScalarIndent = null
    }
  }

  return violations
}

function maskFrontmatter(source) {
  const range = frontmatterRange(source)
  if (!range) {
    return source
  }

  return range.lines
    .map((line, index) =>
      index <= range.closingIndex ? ' '.repeat(line.length) : line
    )
    .join('\n')
}

function walk(node, visit, parent = null) {
  if (visit(node, parent) === false) {
    return
  }

  if (!Array.isArray(node.children)) {
    return
  }

  for (const child of node.children) {
    walk(child, visit, node)
  }
}

function expressionText(expression) {
  const values = []

  function visit(node) {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child)
      }
      return
    }

    if (!node || typeof node !== 'object') {
      return
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
      values.push(node.value)
      return
    }

    if (
      node.type === 'TemplateElement' &&
      typeof node.value?.cooked === 'string'
    ) {
      values.push(node.value.cooked)
      return
    }

    for (const [key, child] of Object.entries(node)) {
      if (key !== 'loc' && key !== 'range') {
        visit(child)
      }
    }
  }

  visit(expression?.data?.estree)
  return values.join(' ')
}

function isVisibleMdxAttribute(name, value) {
  const normalizedName = name.toLocaleLowerCase()

  if (VISIBLE_MDX_ATTRIBUTES.has(normalizedName)) {
    return true
  }

  if (
    TECHNICAL_MDX_ATTRIBUTES.has(normalizedName) ||
    normalizedName.startsWith('data-') ||
    normalizedName.startsWith('aria-') ||
    /^on[A-Z]/u.test(name)
  ) {
    return false
  }

  if (
    /^(?:https?:|mailto:|tel:|\/|\.{1,2}\/|#)/u.test(value.trim()) ||
    /^[A-Za-z_$][\w$.-]*$/u.test(value.trim())
  ) {
    return false
  }

  return /[A-Za-z]{2}/u.test(value) && /\s|[.!?,:;]/u.test(value)
}

function mdxAttributeTexts(attribute) {
  if (
    attribute.type !== 'mdxJsxAttribute' ||
    typeof attribute.name !== 'string'
  ) {
    return []
  }

  if (typeof attribute.value === 'string') {
    return isVisibleMdxAttribute(attribute.name, attribute.value)
      ? [attribute.value]
      : []
  }

  const value = expressionText(attribute.value)
  return value && isVisibleMdxAttribute(attribute.name, value) ? [value] : []
}

function visibleText(node) {
  if (node.type === 'text') {
    return node.value
  }
  if (
    (node.type === 'image' || node.type === 'imageReference') &&
    typeof node.alt === 'string'
  ) {
    return node.alt
  }
  if (node.type === 'break') {
    return ' '
  }
  if (node.type === 'code' || node.type === 'inlineCode') {
    return ''
  }
  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    return expressionText(node)
  }

  const attributes = Array.isArray(node.attributes)
    ? node.attributes.flatMap(mdxAttributeTexts)
    : []
  const children = Array.isArray(node.children)
    ? node.children.map(visibleText)
    : []

  return [...attributes, ...children].filter(Boolean).join(' ')
}

function scanCodeBlock(file, node) {
  const extension = DOC_CODE_LANGUAGES.get(node.lang?.toLocaleLowerCase() ?? '')
  if (!extension) {
    return []
  }

  return scanTypeScript(`${file}.${extension}`, node.value, {
    includeCodeComments: true,
    includeDocComments: false,
    includeStrings: true,
  }).map(violation => ({
    ...violation,
    file,
    line: violation.line + (node.position?.start.line ?? 1),
    column:
      violation.column + Math.max(0, (node.position?.start.column ?? 1) - 1),
  }))
}

export function scanMarkdown(file, source) {
  const violations = scanFrontmatter(file, source)
  const tree = remark().use(remarkMdx).parse(maskFrontmatter(source))

  walk(tree, (node, parent) => {
    if (node.type === 'code') {
      violations.push(...scanCodeBlock(file, node))
      return false
    }

    if (PROSE_BLOCKS.has(node.type)) {
      violations.push(
        ...scanText(file, visibleText(node).replace(/\s+/gu, ' '), {
          startLine: node.position?.start.line ?? 1,
          startColumn: node.position?.start.column ?? 1,
        })
      )
      return false
    }

    if (
      node.type === 'mdxFlowExpression' ||
      node.type === 'mdxTextExpression'
    ) {
      const value = expressionText(node)
      if (value) {
        violations.push(
          ...scanText(file, value, {
            startLine: node.position?.start.line ?? 1,
            startColumn: node.position?.start.column ?? 1,
          })
        )
      }
      return false
    }

    if (
      (node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement') &&
      Array.isArray(node.attributes)
    ) {
      for (const attribute of node.attributes) {
        for (const value of mdxAttributeTexts(attribute)) {
          violations.push(
            ...scanText(file, value, {
              startLine: attribute.position?.start.line ?? 1,
              startColumn: attribute.position?.start.column ?? 1,
            })
          )
        }
      }
    }

    return true
  })

  return violations.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )
}
