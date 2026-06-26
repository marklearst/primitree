import { createSitemapEntries } from '@/lib/discovery'
import { source } from '@/lib/source'

export default function sitemap() {
  return createSitemapEntries(source.getPages())
}
