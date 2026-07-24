import { homeSocialImage } from '@/lib/discovery'
import { generate as DefaultImage } from 'fumadocs-ui/og'
import { ImageResponse } from 'next/og'

export const alt = homeSocialImage.alt
export const size = homeSocialImage.size
export const contentType = homeSocialImage.contentType

export default function Image() {
  return new ImageResponse(
    <DefaultImage
      title={homeSocialImage.title}
      description={homeSocialImage.description}
      site={homeSocialImage.title}
    />,
    size
  )
}
