import type { Metadata, MetadataRoute } from 'next'

export const siteUrl = 'https://figmavars.com'
export const siteName = 'FigmaVars'

const siteDescription =
  'Convert a Figma variables export into DTCG files and the code your app imports.'

export const homeSocialImage = {
  url: `${siteUrl}/opengraph-image`,
  alt: 'FigmaVars design token pipeline',
  title: siteName,
  description: siteDescription,
  size: {
    width: 1200,
    height: 630,
  },
  contentType: 'image/png',
} as const

type SocialImage = {
  url: string
  alt: string
  width: number
  height: number
}

type PageMetadataOptions = {
  title: string
  description: string
  pathname: string
  image?: SocialImage
}

type DocsPage = {
  slugs: string[]
}

type SitemapPage = {
  url: string
}

function toSocialImage(
  image: typeof homeSocialImage = homeSocialImage
): SocialImage {
  return {
    url: image.url,
    alt: image.alt,
    width: image.size.width,
    height: image.size.height,
  }
}

function getPublicUrl(pathname: string): string {
  return new URL(pathname, `${siteUrl}/`).toString()
}

export const siteMetadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    title: siteName,
    description: siteDescription,
    siteName,
    images: [toSocialImage()],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
    images: [toSocialImage()],
  },
} satisfies Metadata

export function createPageMetadata({
  title,
  description,
  pathname,
  image = toSocialImage(),
}: PageMetadataOptions): Metadata {
  const url = getPublicUrl(pathname)
  const images = [image]

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images,
    },
  }
}

export function getDocsImage(page: DocsPage) {
  const segments = [...page.slugs, 'image.png']

  return {
    segments,
    url: getPublicUrl(`/og/docs/${segments.join('/')}`),
  }
}

export function getDocsPageSlugsFromImage(segments: string[]): string[] | null {
  if (segments.at(-1) !== 'image.png') {
    return null
  }

  return segments.slice(0, -1)
}

export function createDocsImageStaticParams(pages: DocsPage[]) {
  return pages.map(page => ({
    slug: getDocsImage(page).segments,
  }))
}

export function createDocsImageNotFoundResponse(): Response {
  return new Response('Image not found.', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

export function createSitemapEntries(
  pages: SitemapPage[]
): MetadataRoute.Sitemap {
  const paths = ['/', '/docs', '/playground', ...pages.map(page => page.url)]
  const uniquePaths = [...new Set(paths)]

  return uniquePaths.map(path => ({
    url: getPublicUrl(path),
  }))
}

export function createRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
