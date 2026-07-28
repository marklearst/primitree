import ts from 'typescript'

import { scanText } from './rules.mjs'

const VISIBLE_PROPERTY_NAMES = new Set([
  'alt',
  'aria-label',
  'description',
  'help',
  'label',
  'message',
  'placeholder',
  'summary',
  'text',
  'title',
])

const TECHNICAL_PROPERTY_NAMES = new Set([
  'class',
  'className',
  'href',
  'id',
  'key',
  'src',
  'style',
])

const HUMAN_FACING_CALLS = new Set([
  'console.debug',
  'console.error',
  'console.info',
  'console.log',
  'console.warn',
  'figma.notify',
  'process.stderr.write',
  'process.stdout.write',
  'setError',
  'setMessage',
  'setNotice',
  'setStatus',
  'setWarning',
  'showError',
])

const DOC_CODE_LANGUAGES = new Map([
  ['js', 'js'],
  ['javascript', 'js'],
  ['jsx', 'jsx'],
  ['ts', 'ts'],
  ['typescript', 'ts'],
  ['tsx', 'tsx'],
])

function scriptKind(file) {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX
  }
  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX
  }
  if (file.endsWith('.js') || file.endsWith('.mjs')) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

function lineAndColumn(sourceFile, position) {
  const point = sourceFile.getLineAndCharacterOfPosition(position)
  return {
    startLine: point.line + 1,
    startColumn: point.character + 1,
  }
}

function propertyName(node) {
  if (
    ts.isPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isJsxAttribute(node)
  ) {
    const name = node.name
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
      return name.text
    }
  }

  return null
}

function isModuleSpecifier(node) {
  const parent = node.parent
  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    ts.isExternalModuleReference(parent)
  )
}

function isObjectKey(node) {
  const parent = node.parent
  return (
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node)
  )
}

function expressionName(node) {
  if (ts.isIdentifier(node)) {
    return node.text
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = expressionName(node.expression)
    return owner ? `${owner}.${node.name.text}` : node.name.text
  }
  return null
}

function isHumanFacingCallArgument(node) {
  const parent = node.parent
  if (
    (!ts.isCallExpression(parent) && !ts.isNewExpression(parent)) ||
    !parent.arguments?.includes(node)
  ) {
    return false
  }

  const name = expressionName(parent.expression)
  if (!name) {
    return false
  }

  return (
    HUMAN_FACING_CALLS.has(name) ||
    (ts.isNewExpression(parent) && /(?:^|\.)[A-Za-z]*Error$/u.test(name))
  )
}

function enclosingPropertyName(node) {
  let current = node.parent

  while (current && !ts.isStatement(current)) {
    const name = propertyName(current)
    if (name) {
      return name
    }
    current = current.parent
  }

  return null
}

function isVisibleString(node, value) {
  if (isModuleSpecifier(node) || isObjectKey(node)) {
    return false
  }

  if (isHumanFacingCallArgument(node)) {
    return true
  }

  const parentName = enclosingPropertyName(node)
  if (parentName && TECHNICAL_PROPERTY_NAMES.has(parentName)) {
    return false
  }

  if (parentName && VISIBLE_PROPERTY_NAMES.has(parentName)) {
    return true
  }

  if (
    ts.isCallExpression(node.parent) &&
    ts.isPropertyAccessExpression(node.parent.expression) &&
    node.parent.expression.name.text === 'describe'
  ) {
    return true
  }

  return /\s/u.test(value) && /[A-Za-z]{2}/u.test(value)
}

function maskDocCode(comment) {
  const lines = comment.split('\n')
  let inFence = false

  return lines
    .map(line => {
      const cleaned = line.replace(/^\s*\* ?/u, '')
      if (/^\s*(?:```|~~~)/u.test(cleaned)) {
        inFence = !inFence
        return ''
      }
      if (inFence) {
        return ''
      }

      return cleaned
        .replace(/^\s*@example\b\s*/u, '')
        .replace(/`[^`\n]+`/gu, '')
        .replace(/\{@link\s+\S+(?:\s+\|\s+([^}]+))?\}/gu, '$1')
        .replace(/!?\[([^\]]*)\]\((?:\\.|[^)])+\)/gu, '$1')
        .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/u, '')
        .replace(/https?:\/\/\S+/gu, '')
        .replace(/^\s*@(?:packageDocumentation|public)\b/gu, '')
        .replace(/^\s*@(remarks|returns?|param|see|throws?)\b\s*/gu, '')
    })
    .join('\n')
}

function hasModifier(node, kind) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some(modifier => modifier.kind === kind) ?? false)
    : false
}

function declarationName(node) {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text
  }
  return null
}

function explicitlyExportedNames(sourceFile) {
  const names = new Set()

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue
    }

    for (const element of statement.exportClause.elements) {
      names.add((element.propertyName ?? element.name).text)
    }
  }

  return names
}

function isPublicMemberContainer(node) {
  return (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeLiteralNode(node) ||
    ts.isEnumDeclaration(node)
  )
}

function exportedDocRanges(source, sourceFile) {
  const ranges = []
  const seen = new Set()
  const namedExports = explicitlyExportedNames(sourceFile)

  function addLeadingComment(node) {
    for (const range of ts.getLeadingCommentRanges(source, node.pos) ?? []) {
      if (
        range.kind !== ts.SyntaxKind.MultiLineCommentTrivia ||
        !source.startsWith('/**', range.pos) ||
        seen.has(range.pos)
      ) {
        continue
      }

      seen.add(range.pos)
      ranges.push(range)
    }
  }

  function visit(node, publicByParent = false) {
    if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) {
      return
    }

    const name = declarationName(node)
    const isPublic =
      publicByParent ||
      hasModifier(node, ts.SyntaxKind.ExportKeyword) ||
      (name !== null && namedExports.has(name))

    if (isPublic) {
      addLeadingComment(node)
    }

    if (
      ts.isBlock(node) &&
      (ts.isFunctionLike(node.parent) ||
        ts.isConstructorDeclaration(node.parent))
    ) {
      return
    }

    const childrenArePublic = isPublic && isPublicMemberContainer(node)
    ts.forEachChild(node, child => visit(child, childrenArePublic))
  }

  visit(sourceFile)
  return ranges
}

function allDocRanges(source) {
  return [...source.matchAll(/\/\*\*[\s\S]*?\*\//gu)].map(match => ({
    pos: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
}

function cleanDocLine(line) {
  const cleaned = line.replace(/^\s*\* ?/u, '')
  return {
    text: cleaned,
    prefixLength: line.length - cleaned.length,
  }
}

function scanDocCodeExamples(file, comment, commentStartLine) {
  const violations = []
  const lines = comment.split('\n').map(cleanDocLine)
  let fence = null

  function scanFence() {
    if (!fence || fence.lines.length === 0) {
      return
    }

    const code = fence.lines.map(line => line.text).join('\n')
    const exampleFile = `${file}.${fence.extension}`
    const sourceFile = ts.createSourceFile(
      exampleFile,
      code,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(exampleFile)
    )

    for (const violation of [
      ...scanStrings(file, code, sourceFile),
      ...scanCodeComments(file, code, sourceFile),
    ]) {
      const line = fence.lines[violation.line - 1]
      violations.push({
        ...violation,
        line: commentStartLine + fence.startIndex + violation.line - 1,
        column: violation.column + (line?.prefixLength ?? 0),
      })
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (fence) {
      if (line.text.trimStart().startsWith(fence.marker)) {
        scanFence()
        fence = null
      } else {
        fence.lines.push(line)
      }
      continue
    }

    const opening = line.text.match(/^\s*(```|~~~)\s*([A-Za-z]+)\s*$/u)
    const extension = DOC_CODE_LANGUAGES.get(
      opening?.[2]?.toLocaleLowerCase() ?? ''
    )
    if (opening && extension) {
      fence = {
        marker: opening[1],
        extension,
        startIndex: index + 1,
        lines: [],
      }
    }
  }

  if (fence) {
    scanFence()
  }

  return violations
}

function scanDocComments(file, source, sourceFile, mode) {
  const violations = []
  const ranges =
    mode === 'all'
      ? allDocRanges(source)
      : exportedDocRanges(source, sourceFile)

  for (const range of ranges) {
    const comment = source.slice(range.pos + 3, range.end - 2)
    const prefix = source.slice(0, range.pos + 3)
    const lines = prefix.split('\n')
    const content = maskDocCode(comment)

    violations.push(...scanDocCodeExamples(file, comment, lines.length))

    violations.push(
      ...scanText(file, content, {
        startLine: lines.length,
        startColumn: 1,
      })
    )
  }

  return violations
}

function scanStrings(file, source, sourceFile) {
  const violations = []

  function visit(node) {
    if (ts.isJsxText(node) && node.getText(sourceFile).trim()) {
      const value = node.getText(sourceFile)
      violations.push(
        ...scanText(file, value, lineAndColumn(sourceFile, node.getStart()))
      )
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (isVisibleString(node, node.text)) {
        violations.push(
          ...scanText(
            file,
            node.text,
            lineAndColumn(sourceFile, node.getStart())
          )
        )
      }
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (isVisibleString(node, node.text)) {
        violations.push(
          ...scanText(
            file,
            node.text,
            lineAndColumn(sourceFile, node.getStart())
          )
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function commentProseGroups(comment) {
  const lines = comment.split('\n')
  const groups = []
  let group = []
  let offset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    let start = 0
    let end = line.length

    if (index === 0) {
      const opening = line.match(/^(?:\/\/|\/\*\*?) ?/u)
      start = opening?.[0].length ?? 0
    } else {
      const prefix = line.match(/^[^\S\r\n]*\* ?/u)
      start = prefix?.[0].length ?? 0
    }

    const closing = line.slice(start, end).match(/\*\/[^\S\r\n]*$/u)
    if (closing?.index !== undefined) {
      end = start + closing.index
    }

    const leadingSpace =
      line.slice(start, end).match(/^[^\S\r\n]*/u)?.[0].length ?? 0
    start += leadingSpace

    const trailingSpace =
      line.slice(start, end).match(/[^\S\r\n]*$/u)?.[0].length ?? 0
    end -= trailingSpace

    if (start < end) {
      group.push({
        offset: offset + start,
        text: line.slice(start, end),
      })
    } else if (group.length > 0) {
      groups.push(group)
      group = []
    }

    offset += line.length + 1
  }

  if (group.length > 0) {
    groups.push(group)
  }

  return groups
}

function scanCommentGroup(file, group, sourceFile) {
  let text = ''
  const sourcePositions = []

  for (const line of group) {
    if (text) {
      text += ' '
      sourcePositions.push(Math.max(0, line.position - 1))
    }

    text += line.text
    for (let index = 0; index < line.text.length; index += 1) {
      sourcePositions.push(line.position + index)
    }
  }

  const composed = scanText(file, text, {
    positionAtIndex(index) {
      const sourcePosition = sourcePositions[index] ?? group[0].position
      const position = lineAndColumn(sourceFile, sourcePosition)
      return {
        line: position.startLine,
        column: position.startColumn,
      }
    },
  })
  const unique = new Map()

  for (const violation of composed) {
    const key = [
      violation.ruleId,
      violation.line,
      violation.column,
      violation.match,
    ].join('\0')
    unique.set(key, violation)
  }

  return [...unique.values()].sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )
}

function scanCodeComments(file, source, sourceFile) {
  const commentGroups = []
  let previousSingleLineEnd = null
  let adjacentSingleLineGroup = null
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source
  )

  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue
    }

    const tokenPosition = scanner.getTokenPos()
    const tokenText = scanner.getTokenText()
    const groups = commentProseGroups(tokenText).map(group =>
      group.map(line => ({
        position: tokenPosition + line.offset,
        text: line.text,
      }))
    )

    if (token === ts.SyntaxKind.SingleLineCommentTrivia) {
      const gap =
        previousSingleLineEnd === null
          ? ''
          : source.slice(previousSingleLineEnd, tokenPosition)
      const followsPreviousLine = /^\r?\n[^\S\r\n]*$/u.test(gap)

      if (
        followsPreviousLine &&
        adjacentSingleLineGroup &&
        groups.length === 1
      ) {
        adjacentSingleLineGroup.push(...groups[0])
      } else if (groups.length === 1) {
        adjacentSingleLineGroup = groups[0]
        commentGroups.push(adjacentSingleLineGroup)
      } else {
        adjacentSingleLineGroup = null
      }

      previousSingleLineEnd = tokenPosition + tokenText.length
    } else {
      commentGroups.push(...groups)
      previousSingleLineEnd = null
      adjacentSingleLineGroup = null
    }
  }

  return commentGroups.flatMap(group =>
    scanCommentGroup(file, group, sourceFile)
  )
}

export function scanTypeScript(
  file,
  source,
  {
    includeCodeComments = false,
    includeDocComments = false,
    includeStrings = false,
  } = {}
) {
  const violations = []
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file)
  )

  if (includeDocComments) {
    violations.push(
      ...scanDocComments(
        file,
        source,
        sourceFile,
        includeDocComments === 'all' ? 'all' : 'exported'
      )
    )
  }

  if (includeStrings) {
    violations.push(...scanStrings(file, source, sourceFile))
  }

  if (includeCodeComments) {
    violations.push(...scanCodeComments(file, source, sourceFile))
  }

  return violations.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )
}
