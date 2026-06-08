import { LandingBackground } from '@/components/landing/background'
import { MarketingShell } from '@/components/landing/site-chrome'
import { FeatureGrid } from '@/components/landing/feature-grid'
import { Hero } from '@/components/landing/hero'
import { PipelinePreview } from '@/components/landing/pipeline-preview'
import { CtaStrip, WorkflowStrip } from '@/components/landing/workflow'

export default function HomePage() {
  return (
    <>
      <LandingBackground />
      <MarketingShell active='home'>
        <Hero />
        <PipelinePreview />
        <FeatureGrid />
        <WorkflowStrip />
        <CtaStrip />
      </MarketingShell>
    </>
  )
}
