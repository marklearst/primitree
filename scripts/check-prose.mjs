#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectDeclarationFiles,
  collectDocsNavigationFiles,
  collectFigmaPluginManifestFiles,
  collectGeneratedApiFiles,
  collectMarkdownFiles,
  collectPackageManifests,
  collectPublicCopyFiles,
  collectPublicHtmlFiles,
  validateBuiltProseFiles,
  validateGeneratedApiFiles,
} from './prose/files.mjs'
import { scanDocsNavigationJson } from './prose/docs-json.mjs'
import { scanHtml } from './prose/html.mjs'
import { scanMarkdown } from './prose/markdown.mjs'
import { scanPackageDescription } from './prose/package-json.mjs'
import { scanFigmaPluginManifest } from './prose/plugin-manifest.mjs'
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
  const figmaPluginManifestFiles = await collectFigmaPluginManifestFiles(root)
  const packageManifests = await collectPackageManifests(root)
  const publicCopyFiles = await collectPublicCopyFiles(root)
  const publicHtmlFiles = await collectPublicHtmlFiles(root)
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
    ...(await scanFiles(figmaPluginManifestFiles, scanFigmaPluginManifest)),
    ...(await scanFiles(packageManifests, scanPackageDescription)),
    ...(await scanFiles(publicHtmlFiles, scanHtml)),
    ...(await scanFiles(typeScriptFiles, (file, source) =>
      scanTypeScript(file, source, {
        includeDocComments: 'all',
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
      `Public prose check passed (${markdownFiles.length} Markdown files, ${docsNavigationFiles.length} navigation files, ${figmaPluginManifestFiles.length} Figma plugin manifests, ${publicHtmlFiles.length} HTML files, ${typeScriptFiles.length} source files, ${packageManifests.length} package descriptions${requireBuiltOutput ? `, ${declarationFiles.length} declaration files` : ''}).\n`
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
