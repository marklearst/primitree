import { source } from '@/lib/source'
import { ImageResponse } from 'next/og'
import { generate as DefaultImage } from 'fumadocs-ui/og'
import {
  createDocsImageNotFoundResponse,
  createDocsImageStaticParams,
  getDocsPageSlugsFromImage,
  siteName,
} from '@/lib/discovery'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: RouteContext<'/og/docs/[...slug]'>
) {
  const { slug } = await params
  const pageSlugs = getDocsPageSlugsFromImage(slug)
  if (!pageSlugs) {
    return createDocsImageNotFoundResponse()
  }

  const page = source.getPage(pageSlugs)
  if (!page) {
    return createDocsImageNotFoundResponse()
  }

  return new ImageResponse(
    <DefaultImage
      title={page.data.title}
      description={page.data.description}
      site={siteName}
    />,
    {
      width: 1200,
      height: 630,
    }
  )
}

export function generateStaticParams() {
  return createDocsImageStaticParams(source.getPages())
}
