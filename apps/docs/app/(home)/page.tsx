import { GovernanceHome } from '@/components/landing/governance-home'
import { MarketingShell } from '@/components/landing/site-chrome'
import { readPrimitreeVersion } from '@/lib/landing/release'

export default function HomePage() {
  return (
    <MarketingShell
      active='home'
      versionLabel={`v${readPrimitreeVersion()}`}>
      <GovernanceHome />
    </MarketingShell>
  )
}
