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
            v1 · local export and build
          </p>

          <h1 className='hero-title'>
            Turn variables.json
            <br />
            into code
            <br />
            <span className='hero-title-accent'>your app can use.</span>
          </h1>

          <p className='hero-lede'>
            Run one command to write DTCG, CSS, Tailwind v4, TypeScript, and a
            Resolver. Use semantic diffs in pull requests. React hooks and MCP
            tools read the same token files.
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
