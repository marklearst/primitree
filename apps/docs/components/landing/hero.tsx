import Link from 'next/link'
import { AnimatedMark } from '@/components/landing/animated-mark'
import { HeroTerminal } from '@/components/landing/hero-terminal'

export function Hero() {
  return (
    <section className='hero-section'>
      <div className='hero-inner'>
        <div className='hero-copy'>
          <p className='hero-eyebrow'>
            <span className='hero-eyebrow-dot' />
            v5 · works on every Figma plan
          </p>

          <h1 className='hero-title'>
            Your export
            <br />
            is not a pipeline.
            <br />
            <span className='hero-title-accent'>Fix that.</span>
          </h1>

          <p className='hero-lede'>
            Drop <code>variables.json</code> in. Get DTCG, CSS, Tailwind v4,
            TypeScript, CI, diffs, hooks, MCP. One command. Nothing uploads.
          </p>

          <div className='hero-actions'>
            <Link
              href='/docs/getting-started'
              className='btn-primary hero-cta'>
              Read the docs
            </Link>
            <Link
              href='/playground'
              className='btn-ghost hero-cta font-mono text-sm'>
              Try playground
            </Link>
          </div>
        </div>

        <div className='hero-visual'>
          <AnimatedMark className='hero-mark' />
          <HeroTerminal />
        </div>
      </div>
    </section>
  )
}
