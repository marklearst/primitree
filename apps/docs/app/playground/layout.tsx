import { LandingBackground } from '@/components/landing/background'
import { MarketingShell } from '@/components/landing/site-chrome'

export default function PlaygroundLayout({
  children,
}: LayoutProps<'/playground'>) {
  return (
    <>
      <LandingBackground />
      <MarketingShell active='playground'>{children}</MarketingShell>
    </>
  )
}
