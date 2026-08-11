import { GovernanceHome } from '@/components/landing/governance-home'
import { MarketingShell } from '@/components/landing/site-chrome'

export default function HomePage() {
  return (
    <MarketingShell active='home'>
      <GovernanceHome />
    </MarketingShell>
  )
}
