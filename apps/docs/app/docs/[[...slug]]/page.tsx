import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page'
import { notFound } from 'next/navigation'
import { getMDXComponents } from '@/components/mdx'
import type { Metadata } from 'next'
import { createRelativeLink } from 'fumadocs-ui/mdx'
import { getDocsGithubUrl } from '@/lib/shared'
import { createPageMetadata } from '@/lib/discovery'

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) {
    notFound()
  }

  const MDX = page.data.body
  const markdownUrl = getPageMarkdownUrl(page).url
  const githubUrl = getDocsGithubUrl(page.path)

  /* The article is the page's main landmark. A wrapper with no box would hide
     the segment's first node from Next's scroll-to-top, so a visitor arriving
     from a scrolled homepage would land mid-article. */
  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      role='main'>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className='mb-0'>
        {page.data.description}
      </DocsDescription>
      <div className='flex flex-row gap-2 items-center border-b pb-6'>
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          {...(githubUrl ? { githubUrl } : {})}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(
  props: PageProps<'/docs/[[...slug]]'>
): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) {
    notFound()
  }

  const image = getPageImage(page)
  const description =
    page.data.description ??
    `Read the ${page.data.title} documentation for Primitree.`

  return createPageMetadata({
    title: page.data.title,
    description,
    pathname: page.url,
    image: {
      url: image.url,
      alt: `${page.data.title} documentation`,
      width: 1200,
      height: 630,
    },
  })
}
