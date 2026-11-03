import { HomePage } from '@/components/landing/home-page'
import { MarketingShell } from '@/components/landing/site-chrome'
import { readPrimitreeVersion } from '@/lib/landing/release'

export default function Page() {
  return (
    <MarketingShell
      active='home'
      versionLabel={`v${readPrimitreeVersion()}`}>
      <HomePage />
    </MarketingShell>
  )
}
