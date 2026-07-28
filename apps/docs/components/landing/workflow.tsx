import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { links } from '@/lib/shared'

const steps = [
  'Export variables.json',
  'primitree build',
  'Commit design-tokens/',
  'Import CSS or hooks',
  'primitree diff on the next PR',
]

export function WorkflowStrip() {
  return (
    <section className='workflow-section'>
      <div className='workflow-inner'>
        <h2 className='workflow-heading'>
          Build and review tokens from a Figma export
        </h2>
        <ol className='workflow-steps'>
          {steps.map((step, i) => (
            <li
              key={step}
              style={{ '--i': i } as React.CSSProperties}>
              <span className='workflow-n'>{i + 1}</span>
              <span
                className={
                  i === 1 || i === 4 ? 'text-primitree-good' : undefined
                }>
                {step}
              </span>
            </li>
          ))}
        </ol>
        <Link
          href='/docs/getting-started/export-variables'
          className='workflow-link'>
          Export options
        </Link>
      </div>
    </section>
  )
}

export function CtaStrip() {
  return (
    <section className='cta-section'>
      <div className='cta-inner'>
        <BrandLogo
          size='lg'
          className='mx-auto'
        />
        <p className='cta-copy'>MIT licensed · marklearst/primitree</p>
        <div className='cta-actions'>
          <Link
            href='/docs'
            className='btn-primary hero-cta'>
            Documentation
          </Link>
          <Link
            href={links.github}
            target='_blank'
            className='btn-ghost hero-cta'>
            GitHub
          </Link>
        </div>
      </div>
    </section>
  )
}
