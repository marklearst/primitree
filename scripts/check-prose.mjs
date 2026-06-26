#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectDeclarationFiles,
  collectDocsNavigationFiles,
  collectGeneratedApiFiles,
  collectMarkdownFiles,
  collectPackageManifests,
  collectPublicCopyFiles,
  validateBuiltProseFiles,
  validateGeneratedApiFiles,
} from './prose/files.mjs'
import { scanDocsNavigationJson } from './prose/docs-json.mjs'
import { scanMarkdown } from './prose/markdown.mjs'
import { scanPackageDescription } from './prose/package-json.mjs'
import { scanTypeScript } from './prose/typescript.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireBuiltOutput = process.argv.includes('--built')

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/')
}

async function scanFiles(files, scanner) {
  const violations = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    violations.push(...scanner(relative(file), source))
  }

  return violations
}

async function run() {
  const markdownFiles = await collectMarkdownFiles(root, {
    includeGenerated: true,
  })
  const generatedApiFiles = await collectGeneratedApiFiles(root)
  const docsNavigationFiles = await collectDocsNavigationFiles(root)
  const packageManifests = await collectPackageManifests(root)
  const publicCopyFiles = await collectPublicCopyFiles(root)
  const declarationFiles = requireBuiltOutput
    ? await collectDeclarationFiles(root)
    : []

  if (requireBuiltOutput) {
    validateBuiltProseFiles(root, generatedApiFiles, declarationFiles)
  } else {
    validateGeneratedApiFiles(root, generatedApiFiles)
  }

  const typeScriptFiles = [...new Set(publicCopyFiles)]

  const violations = [
    ...(await scanFiles(markdownFiles, scanMarkdown)),
    ...(await scanFiles(docsNavigationFiles, scanDocsNavigationJson)),
    ...(await scanFiles(packageManifests, scanPackageDescription)),
    ...(await scanFiles(typeScriptFiles, (file, source) =>
      scanTypeScript(file, source, {
        includeDocComments: false,
        includeStrings: true,
      })
    )),
    ...(await scanFiles(declarationFiles, (file, source) =>
      scanTypeScript(file, source, {
        includeDocComments: 'all',
        includeStrings: false,
      })
    )),
  ].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )

  if (violations.length === 0) {
    process.stdout.write(
      `Public prose check passed (${markdownFiles.length} Markdown files, ${docsNavigationFiles.length} navigation files, ${typeScriptFiles.length} source files, ${packageManifests.length} package descriptions${requireBuiltOutput ? `, ${declarationFiles.length} declaration files` : ''}).\n`
    )
    return
  }

  for (const violation of violations) {
    process.stderr.write(
      `${violation.file}:${violation.line}:${violation.column} [${violation.ruleId}] ${violation.message} Found “${violation.match}”.\n`
    )
  }

  throw new Error(
    `Public prose check found ${violations.length} prohibited phrase${violations.length === 1 ? '' : 's'}.`
  )
}

await run()
