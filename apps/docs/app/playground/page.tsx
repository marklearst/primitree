import type { Metadata } from 'next'
import { PlaygroundApp } from '@/components/playground/playground-app'

export const metadata: Metadata = {
  title: 'Playground',
  description:
    'Preview and download a Figma variables token pipeline in your browser.',
}

export default function PlaygroundPage() {
  return <PlaygroundApp />
}
