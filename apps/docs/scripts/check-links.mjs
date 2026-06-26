#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableOfContents } from 'fumadocs-core/content/toc'
import { getSlugs } from 'fumadocs-core/source'
import {
  printErrors,
  readFiles,
  scanURLs,
  validateFiles,
} from 'next-validate-link'

const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const contentRoot = path.join(docsRoot, 'content/docs')
const contentPattern = path.join(contentRoot, '**/*.{md,mdx}')

export function docsPathToUrl(file) {
  const absolute = path.isAbsolute(file)
    ? path.normalize(file)
    : path.resolve(docsRoot, file)
  const relative = path.relative(contentRoot, absolute)

  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Cannot map documentation path: ${file}`)
  }

  const slugs = getSlugs(relative)
  const route = `/docs${slugs.length > 0 ? `/${slugs.join('/')}` : ''}`

  if (/(?:^|[/\\])index\.mdx?$/iu.test(relative)) {
    return `${route}/`
  }

  return route
}

export async function checkDocumentationLinks() {
  const files = await readFiles(contentPattern, {
    pathToUrl: docsPathToUrl,
  })

  if (files.length === 0) {
    throw new Error(`No documentation files found under ${contentRoot}.`)
  }

  const scanned = await scanURLs({
    cwd: docsRoot,
    populate: {
      'docs/[[...slug]]': files.map(file => ({
        value: getSlugs(path.relative(contentRoot, file.path)),
        hashes: getTableOfContents(file.content).map(item => item.url.slice(1)),
      })),
    },
  })

  const results = await validateFiles(files, {
    scanned,
    pathToUrl: docsPathToUrl,
    checkRelativePaths: 'as-url',
    determinatePathname(pathname) {
      if (/\.mdx?$/iu.test(pathname)) {
        return 'relative-file-path'
      }
      if (pathname.startsWith('.')) {
        return 'relative-url'
      }
      return 'url'
    },
    markdown: {
      components: {
        Card: {
          attributes: ['href'],
        },
      },
    },
  })

  printErrors(results, true)
  console.log(
    `Documentation links passed (${files.length} files, ${scanned.urls.size} routes).`
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await checkDocumentationLinks()
}
