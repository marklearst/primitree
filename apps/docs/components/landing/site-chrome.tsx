import type { ReactNode } from 'react'
import Link from 'next/link'
import { GithubLogoIcon } from '@phosphor-icons/react/dist/ssr'
import {
  FullSearchTrigger,
  SearchTrigger,
} from 'fumadocs-ui/layouts/shared/slots/search-trigger'
import { BrandLogo, BrandMark } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/landing/theme-toggle'
import { links } from '@/lib/shared'
import { cn } from '@/lib/cn'

const nav = [
  { label: 'Docs', href: '/docs', key: 'docs' as const },
  { label: 'Playground', href: links.playground, key: 'playground' as const },
]

export function SiteHeader({
  active,
  versionLabel,
}: {
  active?: 'home' | 'docs' | 'playground'
  versionLabel?: string
}) {
  return (
    <header className='sticky top-0 z-50 border-b border-primitree-border bg-primitree-bg'>
      <div className='flex h-[72px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-12'>
        <span className='flex items-center gap-2.5'>
          <BrandLogo
            size='md'
            linked
          />
          {versionLabel === undefined ? null : (
            <code className='site-version'>{versionLabel}</code>
          )}
        </span>
        <nav
          aria-label='Primary navigation'
          className='hidden items-center gap-1 sm:flex'>
          {nav.map(item => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? 'page' : undefined}
              className={cn(
                'site-nav-link inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3.5 text-[13.5px] font-normal transition-colors',
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
            <GithubLogoIcon
              size={18}
              weight='fill'
              aria-hidden='true'
            />
          </Link>
          <ThemeToggle />
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
            <ThemeToggle />
          </nav>
        </details>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className='border-t border-primitree-border'>
      <div className='flex flex-col gap-4 px-6 py-5 text-[12.5px] text-primitree-muted sm:flex-row sm:items-center sm:justify-between lg:px-12'>
        <span className='flex items-center gap-2'>
          <BrandMark className='h-4 w-[18px]' />
          Primitree · MIT · Mark Learst
        </span>
        <span className='flex flex-wrap items-center gap-x-4 gap-y-1'>
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
        </span>
      </div>
    </footer>
  )
}

export function MarketingShell({
  children,
  active,
  versionLabel,
}: {
  children: ReactNode
  active?: 'home' | 'docs' | 'playground'
  versionLabel?: string
}) {
  return (
    <>
      <SiteHeader
        active={active}
        {...(versionLabel === undefined ? {} : { versionLabel })}
      />
      <main className='relative flex-1'>{children}</main>
      <SiteFooter />
    </>
  )
}
