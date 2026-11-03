import { notFound } from 'next/navigation'
import { HomePage } from '@/components/landing/home-page'
import { MarketingShell } from '@/components/landing/site-chrome'
import { ThemeLab } from '@/components/landing/theme-lab'
import { readPrimitreeVersion } from '@/lib/landing/release'
import themeConfig from '@/tokens/theme.config.json' with { type: 'json' }

/** The theme generator: the real homepage under a panel of knobs. It exists in
 * development alone, and nothing in production imports it. */
export default function ThemeLabPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }
  return (
    <MarketingShell
      active='home'
      versionLabel={`v${readPrimitreeVersion()}`}>
      <HomePage />
      <ThemeLab initial={themeConfig} />
    </MarketingShell>
  )
}
