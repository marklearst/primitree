import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const docsRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'content',
  'docs'
)
const discoveryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'lib',
  'discovery.ts'
)

type DiscoveryModule = typeof import('../lib/discovery.ts')

async function loadDiscovery(): Promise<DiscoveryModule> {
  assert.equal(
    existsSync(discoveryPath),
    true,
    'apps/docs/lib/discovery.ts must define the public discovery contract'
  )

  return import(pathToFileURL(discoveryPath).href) as Promise<DiscoveryModule>
}

async function findMdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map(entry => {
      const path = join(directory, entry.name)
      return entry.isDirectory()
        ? findMdxFiles(path)
        : Promise.resolve(entry.name.endsWith('.mdx') ? [path] : [])
    })
  )

  return paths.flat().sort()
}

function docsUrlFromFile(path: string): string {
  const relativePath = path
    .slice(docsRoot.length + 1)
    .replaceAll('\\', '/')
    .replace(/\.mdx$/, '')
  const route =
    relativePath === 'index' ? '' : relativePath.replace(/\/index$/, '')

  return route ? `/docs/${route}` : '/docs'
}

function assertPlainPublicText(value: string) {
  assert.doesNotMatch(value, /—/)
  assert.doesNotMatch(
    value,
    /\b(canonical|deterministic|robust|seamless|idiomatic|modern)\b/i
  )
}

test('site metadata uses the public host and complete social cards', async () => {
  const { siteMetadata, siteUrl } = await loadDiscovery()

  assert.equal(siteUrl, 'https://primitree.com')
  assert.equal(siteMetadata.metadataBase?.toString(), `${siteUrl}/`)
  assert.deepEqual(siteMetadata.title, {
    default: 'Primitree',
    template: '%s · Primitree',
  })
  assert.equal(siteMetadata.alternates?.canonical, siteUrl)
  assert.equal(siteMetadata.openGraph?.url, siteUrl)
  assert.equal(siteMetadata.openGraph?.type, 'website')
  assert.equal(siteMetadata.openGraph?.siteName, 'Primitree')
  assert.equal(siteMetadata.twitter?.card, 'summary_large_image')
  assert.deepEqual(siteMetadata.openGraph?.images, siteMetadata.twitter?.images)

  assertPlainPublicText(String(siteMetadata.description))
  assertPlainPublicText(String(siteMetadata.openGraph?.description))
  assertPlainPublicText(String(siteMetadata.twitter?.description))
})

test('page metadata sets the page URL and matching social fields', async () => {
  const { createPageMetadata, siteUrl } = await loadDiscovery()
  const description =
    'Preview a Figma variables token pipeline and download the generated files.'
  const metadata = createPageMetadata({
    title: 'Playground',
    description,
    pathname: '/playground',
  })

  assert.equal(metadata.title, 'Playground')
  assert.equal(metadata.description, description)
  assert.equal(metadata.alternates?.canonical, `${siteUrl}/playground`)
  assert.equal(metadata.openGraph?.url, `${siteUrl}/playground`)
  assert.equal(metadata.openGraph?.title, 'Playground')
  assert.equal(metadata.openGraph?.description, description)
  assert.equal(metadata.twitter?.title, 'Playground')
  assert.equal(metadata.twitter?.description, description)
  assert.ok(metadata.twitter && 'card' in metadata.twitter)
  assert.equal(metadata.twitter?.card, 'summary_large_image')
  assert.deepEqual(metadata.openGraph?.images, metadata.twitter?.images)
})

test('the home image has share-card dimensions and plain text', async () => {
  const { homeSocialImage, siteUrl } = await loadDiscovery()

  assert.deepEqual(homeSocialImage.size, { width: 1200, height: 630 })
  assert.equal(homeSocialImage.contentType, 'image/png')
  assert.equal(homeSocialImage.url, `${siteUrl}/opengraph-image`)
  assertPlainPublicText(homeSocialImage.alt)
  assertPlainPublicText(homeSocialImage.title)
  assertPlainPublicText(homeSocialImage.description)
})

test('docs image URLs map back to each source page', async () => {
  const {
    createDocsImageStaticParams,
    getDocsImage,
    getDocsPageSlugsFromImage,
    siteUrl,
  } = await loadDiscovery()
  const sourceUrls = (await findMdxFiles(docsRoot)).map(docsUrlFromFile)
  const sourcePages = sourceUrls.map(url => ({
    url,
    slugs: url === '/docs' ? [] : url.slice('/docs/'.length).split('/'),
  }))

  for (const page of sourcePages) {
    const image = getDocsImage(page)
    assert.equal(
      image.url,
      `${siteUrl}/og/docs/${[...page.slugs, 'image.png'].join('/')}`
    )
    assert.deepEqual(getDocsPageSlugsFromImage(image.segments), page.slugs)
  }

  assert.deepEqual(
    createDocsImageStaticParams(sourcePages),
    sourcePages.map(page => ({
      slug: [...page.slugs, 'image.png'],
    }))
  )
  assert.equal(getDocsPageSlugsFromImage(['hooks', 'wrong.png']), null)
  assert.equal(getDocsPageSlugsFromImage([]), null)
})

test('missing docs images return a non-empty 404 response', async () => {
  const { createDocsImageNotFoundResponse } = await loadDiscovery()
  const response = createDocsImageNotFoundResponse()

  assert.equal(response.status, 404)
  assert.equal(
    response.headers.get('content-type'),
    'text/plain; charset=utf-8'
  )
  assert.equal(await response.text(), 'Image not found.')
})

test('the sitemap covers each source page and public app route', async () => {
  const { createSitemapEntries, siteUrl } = await loadDiscovery()
  const sourceUrls = (await findMdxFiles(docsRoot)).map(docsUrlFromFile)
  const sitemap = createSitemapEntries(sourceUrls.map(url => ({ url })))
  const urls = sitemap.map(entry => entry.url)
  const requiredUrls = new Set(['/', '/docs', '/playground', ...sourceUrls])

  assert.equal(urls.length, new Set(urls).size)
  assert.deepEqual(
    urls,
    [...requiredUrls].map(path => new URL(path, siteUrl).toString())
  )
})

test('robots allows the site and points to the public sitemap', async () => {
  const { createRobots, siteUrl } = await loadDiscovery()

  assert.deepEqual(createRobots(), {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  })
})
