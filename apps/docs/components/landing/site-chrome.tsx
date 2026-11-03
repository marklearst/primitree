import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  FullSearchTrigger,
  SearchTrigger,
} from 'fumadocs-ui/layouts/shared/slots/search-trigger'
import { BrandLogo, BrandMark } from '@/components/brand-logo'
import { GithubIcon } from '@/components/icons'
import { Island } from '@/components/landing/island'
import { SiteHeaderFrame } from '@/components/landing/site-header-frame'
import { ThemeToggle } from '@/components/landing/theme-toggle'
import { links } from '@/lib/shared'

/* The Playground link does not prefetch: its route carries its own stylesheet,
   which the homepage would preload and never use. */
const nav = [
  { label: 'Docs', href: '/docs', key: 'docs' as const },
  {
    label: 'Playground',
    href: links.playground,
    key: 'playground' as const,
    prefetch: false,
  },
]

/** The site header. It spans the page column the homepage uses, so the mark
 * lines up with the headline. Search, GitHub, and the theme toggle share one
 * ghost icon style; space, not a divider, sets them apart from the links. */
export function SiteHeader({
  active,
  center,
}: {
  active?: 'home' | 'docs' | 'playground'
  center?: ReactNode
}) {
  return (
    <SiteHeaderFrame>
      <div className='site-header-inner'>
        <span className='flex items-center'>
          <BrandLogo
            size='md'
            linked
          />
        </span>
        <span className='site-header-center'>{center}</span>
        <div className='site-header-end'>
          <nav
            aria-label='Primary navigation'
            className='hidden items-center gap-1 sm:flex'>
            {nav.map(item => (
              <Link
                key={item.key}
                href={item.href}
                prefetch={item.prefetch}
                aria-current={active === item.key ? 'page' : undefined}
                className='site-nav-link inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3.5 text-sm font-normal'>
                {item.label}
              </Link>
            ))}
            <span className='site-nav-tools'>
              <SearchTrigger className='site-icon-control' />
              <Link
                href={links.github}
                target='_blank'
                rel='noopener noreferrer'
                aria-label='Primitree on GitHub'
                className='site-icon-control'>
                <GithubIcon size={18} />
              </Link>
              <ThemeToggle />
            </span>
          </nav>
          {/* A popover: a tap outside or Escape closes it, and focus comes back
              to the trigger, with no script of our own. */}
          <button
            type='button'
            className='mobile-nav-trigger flex sm:hidden'
            popoverTarget='site-menu'>
            Menu
          </button>
          <nav
            id='site-menu'
            className='mobile-nav max-sm:open:grid sm:hidden'
            popover='auto'
            aria-label='Mobile navigation'>
            {nav.map(item => (
              <Link
                key={item.key}
                href={item.href}
                prefetch={item.prefetch}
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
            <ThemeToggle variant='menu' />
          </nav>
        </div>
      </div>
    </SiteHeaderFrame>
  )
}

/** A quiet footer on the raised surface, aligned to the homepage column. Every
 * link carries the same padding, so the gaps between them match. */
export function SiteFooter({ versionLabel }: { versionLabel?: string }) {
  return (
    <footer className='site-footer'>
      <div className='site-footer-inner'>
        <p className='site-footer-brand'>
          <BrandMark className='h-4 w-[18px]' />
          Primitree{versionLabel === undefined ? '' : ` ${versionLabel}`} · MIT
          · Mark Learst
        </p>
        <nav
          aria-label='Footer'
          className='site-footer-links'>
          <Link
            href='/docs'
            className='site-footer-link'>
            Documentation
          </Link>
          <Link
            href={links.playground}
            prefetch={false}
            className='site-footer-link'>
            Playground
          </Link>
          <Link
            href={links.npmCli}
            className='site-footer-link'
            target='_blank'
            rel='noopener noreferrer'>
            npm
          </Link>
          <Link
            href={links.github}
            className='site-footer-link'
            target='_blank'
            rel='noopener noreferrer'>
            GitHub
          </Link>
        </nav>
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
        center={active === 'home' ? <Island /> : undefined}
      />
      <main className='relative flex-1'>{children}</main>
      <SiteFooter {...(versionLabel === undefined ? {} : { versionLabel })} />
    </>
  )
}
