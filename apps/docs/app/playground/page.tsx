import { PlaygroundApp } from '@/components/playground/playground-app'
import { createPageMetadata } from '@/lib/discovery'

export const metadata = createPageMetadata({
  title: 'Playground',
  description: 'Preview a variables export and download the generated files.',
  pathname: '/playground',
})

export default function PlaygroundPage() {
  return <PlaygroundApp />
}
