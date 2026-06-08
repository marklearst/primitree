import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { BrandLogo } from '@/components/brand-logo'
import { links } from './shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandLogo size='md' />,
    },
    links: [
      {
        text: 'Home',
        url: '/',
      },
      {
        text: 'Playground',
        url: links.playground,
      },
      {
        text: 'GitHub',
        url: links.github,
        external: true,
      },
    ],
    githubUrl: links.github,
  }
}
