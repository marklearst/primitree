import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { links } from '@/lib/shared'
import { cn } from '@/lib/cn'

const nav = [
  { label: 'Docs', href: '/docs', key: 'docs' as const },
  { label: 'Playground', href: links.playground, key: 'playground' as const },
  {
    label: 'GitHub',
    href: links.github,
    external: true,
    key: 'github' as const,
  },
]

export function SiteHeader({
  active,
}: {
  active?: 'home' | 'docs' | 'playground'
}) {
  return (
    <header className='sticky top-0 z-50 border-b border-fv-border/80 bg-fv-bg/70 backdrop-blur-2xl backdrop-saturate-150'>
      <div className='mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-6 lg:px-8'>
        <BrandLogo
          size='md'
          linked
        />
        <nav className='flex items-center gap-1'>
          {nav.map(item => (
            <Link
              key={item.key}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              className={cn(
                'rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors',
                active === item.key
                  ? 'bg-white/8 text-fv-text'
                  : 'text-fv-muted hover:text-fv-text'
              )}>
              {item.label}
            </Link>
          ))}
          <Link
            href='/docs/getting-started'
            className='btn-primary ml-3 rounded-full px-4 py-2 text-[13px] font-semibold transition-all'>
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className='border-t border-fv-border'>
      <div className='mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-14 lg:px-8'>
        <div className='flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
          <BrandLogo size='sm' />
          <div className='flex flex-wrap gap-x-6 gap-y-2 text-sm text-fv-muted'>
            <Link
              href='/docs'
              className='transition-colors hover:text-fv-text'>
              Documentation
            </Link>
            <Link
              href={links.playground}
              className='transition-colors hover:text-fv-text'>
              Playground
            </Link>
            <Link
              href={links.npmCli}
              className='transition-colors hover:text-fv-text'
              target='_blank'>
              npm
            </Link>
            <Link
              href={links.github}
              className='transition-colors hover:text-fv-text'
              target='_blank'>
              GitHub
            </Link>
          </div>
        </div>
        <p className='text-sm text-fv-dim'>MIT · Mark Learst</p>
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
      <div className='relative'>{children}</div>
      <SiteFooter />
    </>
  )
}
