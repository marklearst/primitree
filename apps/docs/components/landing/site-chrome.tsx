import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  FullSearchTrigger,
  SearchTrigger,
} from 'fumadocs-ui/layouts/shared/slots/search-trigger'
import { BrandLogo } from '@/components/brand-logo'
import { links } from '@/lib/shared'
import { cn } from '@/lib/cn'

const nav = [
  { label: 'Docs', href: '/docs', key: 'docs' as const },
  { label: 'Playground', href: links.playground, key: 'playground' as const },
]

function GithubMark() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='18'
      height='18'
      fill='currentColor'
      aria-hidden='true'>
      <path d='M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A11 11 0 0 1 12 6.11c.98 0 1.95.13 2.87.39 2.19-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.71 5.4-5.29 5.68.42.36.79 1.06.79 2.14v3.27c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z' />
    </svg>
  )
}

export function SiteHeader({
  active,
}: {
  active?: 'home' | 'docs' | 'playground'
}) {
  return (
    <header className='sticky top-0 z-50 border-b border-primitree-border bg-primitree-bg'>
      <div className='mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8'>
        <BrandLogo
          size='md'
          linked
        />
        <nav
          aria-label='Primary navigation'
          className='hidden items-center gap-1 sm:flex'>
          {nav.map(item => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? 'page' : undefined}
              className={cn(
                'site-nav-link inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3.5 text-[13px] font-medium transition-colors',
                active === item.key
                  ? 'bg-primitree-accent-wash text-primitree-accent'
                  : 'text-primitree-muted'
              )}>
              {item.label}
            </Link>
          ))}
          <span
            className='site-nav-divider'
            aria-hidden='true'
          />
          <SearchTrigger className='site-icon-control' />
          <Link
            href={links.github}
            target='_blank'
            rel='noopener noreferrer'
            aria-label='Primitree on GitHub'
            className='site-icon-control'>
            <GithubMark />
          </Link>
        </nav>
        <details
          className='mobile-nav sm:hidden'
          aria-label='Navigation'>
          <summary>Menu</summary>
          <nav aria-label='Mobile navigation'>
            {nav.map(item => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
            <FullSearchTrigger
              className='mobile-search-control'
              aria-label='Open Search'
            />
            <Link href='/docs/getting-started'>Run the quickstart</Link>
            <Link
              href={links.github}
              target='_blank'
              rel='noopener noreferrer'>
              GitHub
            </Link>
          </nav>
        </details>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className='border-t border-primitree-border'>
      <div className='mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-14 lg:px-8'>
        <div className='flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
          <BrandLogo size='sm' />
          <div className='flex flex-wrap gap-x-6 gap-y-2 text-sm text-primitree-muted'>
            <Link
              href='/docs'
              className='site-footer-link transition-colors'>
              Documentation
            </Link>
            <Link
              href={links.playground}
              className='site-footer-link transition-colors'>
              Playground
            </Link>
            <Link
              href={links.npmCli}
              className='site-footer-link transition-colors'
              target='_blank'
              rel='noopener noreferrer'>
              npm
            </Link>
            <Link
              href={links.github}
              className='site-footer-link transition-colors'
              target='_blank'
              rel='noopener noreferrer'>
              GitHub
            </Link>
          </div>
        </div>
        <p className='text-sm text-primitree-dim'>MIT · Mark Learst</p>
      </div>
    </footer>
  )
}

export function MarketingShell({
  children,
  active,
}: {
  children: ReactNode
  active?: 'home' | 'docs' | 'playground'
}) {
  return (
    <>
      <SiteHeader active={active} />
      <main className='relative flex-1'>{children}</main>
      <SiteFooter />
    </>
  )
}
