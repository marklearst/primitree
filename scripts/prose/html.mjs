import { scanText } from './rules.mjs'

const META_COPY_FIELDS = new Set([
  'application-name',
  'description',
  'og:description',
  'og:title',
  'twitter:description',
  'twitter:title',
])

const VISIBLE_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'placeholder',
  'title',
])

const EXCLUDED_ELEMENTS = new Set([
  'code',
  'pre',
  'script',
  'style',
  'template',
])

const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'br',
  'button',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const HTML_ENTITIES = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['mdash', '—'],
  ['nbsp', ' '],
  ['ndash', '–'],
  ['quot', '"'],
])

function decodeEntity(source, index, end) {
  const match =
    /^&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/iu.exec(source.slice(index, end)) ??
    null
  if (!match) {
    return null
  }

  let value
  if (match[1]) {
    const codePoint = Number.parseInt(match[1], 10)
    value =
      Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : undefined
  } else if (match[2]) {
    const codePoint = Number.parseInt(match[2], 16)
    value =
      Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : undefined
  } else {
    value = HTML_ENTITIES.get(match[3].toLocaleLowerCase())
  }

  return value === undefined
    ? null
    : {
        length: match[0].length,
        value,
      }
}

function sourcePosition(source, index) {
  const lines = source.slice(0, index).split('\n')
  return {
    line: lines.length,
    column: lines.at(-1).length + 1,
  }
}

function createMappedText(source) {
  const characters = []
  const sourceIndexes = []

  function appendCharacter(value, sourceIndex) {
    characters.push(value)
    sourceIndexes.push(sourceIndex)
  }

  function appendBoundary(sourceIndex) {
    while (characters.at(-1) === ' ') {
      characters.pop()
      sourceIndexes.pop()
    }
    if (characters.length === 0 || characters.at(-1) === '\n') {
      return
    }
    appendCharacter('\n', sourceIndex)
    appendCharacter('\n', sourceIndex)
  }

  function appendRange(start, end) {
    for (let index = start; index < end;) {
      const entity =
        source[index] === '&' ? decodeEntity(source, index, end) : null
      if (entity) {
        for (const character of entity.value) {
          appendCharacter(character, index)
        }
        index += entity.length
        continue
      }

      if (/\s/u.test(source[index])) {
        const whitespaceStart = index
        while (index < end && /\s/u.test(source[index])) {
          index += 1
        }
        if (
          characters.length > 0 &&
          characters.at(-1) !== ' ' &&
          characters.at(-1) !== '\n'
        ) {
          appendCharacter(' ', whitespaceStart)
        }
        continue
      }

      appendCharacter(source[index], index)
      index += 1
    }
  }

  function result() {
    return {
      text: characters.join(''),
      sourceIndexes,
    }
  }

  return {
    appendBoundary,
    appendRange,
    result,
  }
}

function scanMappedText(file, source, mapped) {
  if (!mapped.text.trim()) {
    return []
  }

  return scanText(file, mapped.text, {
    positionAtIndex(index) {
      return sourcePosition(source, mapped.sourceIndexes[index] ?? 0)
    },
  })
}

function tagEnd(source, start) {
  if (source.startsWith('<!--', start)) {
    const commentEnd = source.indexOf('-->', start + 4)
    return commentEnd === -1 ? source.length : commentEnd + 3
  }

  let quote = null
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index + 1
    }
  }
  return source.length
}

function tokenize(source) {
  const tokens = []

  for (let index = 0; index < source.length;) {
    if (source[index] === '<') {
      const end = tagEnd(source, index)
      const token = {
        type: 'tag',
        start: index,
        end,
        value: source.slice(index, end),
      }
      tokens.push(token)
      index = end

      const details = tagDetails(token)
      if (
        details &&
        !details.closing &&
        !details.selfClosing &&
        EXCLUDED_ELEMENTS.has(details.name)
      ) {
        const closingPattern = new RegExp(`<\\/\\s*${details.name}\\s*>`, 'giu')
        closingPattern.lastIndex = index
        const closingMatch = closingPattern.exec(source)
        if (closingMatch) {
          if (closingMatch.index > index) {
            tokens.push({
              type: 'text',
              start: index,
              end: closingMatch.index,
              value: source.slice(index, closingMatch.index),
            })
          }
          tokens.push({
            type: 'tag',
            start: closingMatch.index,
            end: closingPattern.lastIndex,
            value: closingMatch[0],
          })
          index = closingPattern.lastIndex
        }
      }
      continue
    }

    const nextTag = source.indexOf('<', index)
    const end = nextTag === -1 ? source.length : nextTag
    tokens.push({
      type: 'text',
      start: index,
      end,
      value: source.slice(index, end),
    })
    index = end
  }

  return tokens
}

function tagDetails(token) {
  const match = /^<\s*(\/?)\s*([A-Za-z][\w:-]*)/u.exec(token.value)
  if (!match) {
    return null
  }

  const name = match[2].toLocaleLowerCase()
  return {
    closing: match[1] === '/',
    name,
    selfClosing: VOID_ELEMENTS.has(name) || /\/\s*>$/u.test(token.value),
  }
}

function attributes(token) {
  const values = new Map()
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/dgu

  for (const match of token.value.matchAll(pattern)) {
    const captureIndex =
      match[2] !== undefined ? 2 : match[3] !== undefined ? 3 : 4
    const capture = match.indices?.[captureIndex]
    if (!capture) {
      continue
    }
    values.set(match[1].toLocaleLowerCase(), {
      start: token.start + capture[0],
      end: token.start + capture[1],
      value: match[captureIndex],
    })
  }

  return values
}

function mappedRange(source, start, end) {
  const mapped = createMappedText(source)
  mapped.appendRange(start, end)
  return mapped.result()
}

export function scanHtml(file, source) {
  const violations = []
  const body = createMappedText(source)
  const title = createMappedText(source)
  let excludedDepth = 0
  let inBody = false
  let inTitle = false

  for (const token of tokenize(source)) {
    if (token.type === 'text') {
      if (excludedDepth === 0) {
        if (inBody) {
          body.appendRange(token.start, token.end)
        }
        if (inTitle) {
          title.appendRange(token.start, token.end)
        }
      }
      continue
    }

    const details = tagDetails(token)
    if (!details) {
      continue
    }

    if (details.closing) {
      if (EXCLUDED_ELEMENTS.has(details.name)) {
        excludedDepth = Math.max(0, excludedDepth - 1)
        continue
      }
      if (details.name === 'title' && inTitle) {
        violations.push(...scanMappedText(file, source, title.result()))
        inTitle = false
      }
      if (details.name === 'body') {
        inBody = false
      } else if (
        inBody &&
        excludedDepth === 0 &&
        BLOCK_ELEMENTS.has(details.name)
      ) {
        body.appendBoundary(token.start)
      }
      continue
    }

    if (EXCLUDED_ELEMENTS.has(details.name)) {
      excludedDepth += 1
      continue
    }
    if (excludedDepth > 0) {
      continue
    }

    const fields = attributes(token)
    if (details.name === 'meta') {
      const field = fields.get('name') ?? fields.get('property')
      const content = fields.get('content')
      if (
        field &&
        content &&
        META_COPY_FIELDS.has(field.value.toLocaleLowerCase())
      ) {
        violations.push(
          ...scanMappedText(
            file,
            source,
            mappedRange(source, content.start, content.end)
          )
        )
      }
    }

    if (details.name === 'title') {
      inTitle = true
    }
    if (details.name === 'body') {
      inBody = true
    } else if (inBody && BLOCK_ELEMENTS.has(details.name)) {
      body.appendBoundary(token.start)
    }

    if (inBody) {
      for (const [name, field] of fields) {
        if (VISIBLE_ATTRIBUTES.has(name)) {
          violations.push(
            ...scanMappedText(
              file,
              source,
              mappedRange(source, field.start, field.end)
            )
          )
        }
      }
    }

    if (inBody && details.selfClosing && BLOCK_ELEMENTS.has(details.name)) {
      body.appendBoundary(token.end)
    }
  }

  violations.push(...scanMappedText(file, source, body.result()))

  return violations.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )
}
