import { MarketingShell } from '@/components/landing/site-chrome'

export default function PlaygroundLayout({
  children,
}: LayoutProps<'/playground'>) {
  return <MarketingShell active='playground'>{children}</MarketingShell>
}
