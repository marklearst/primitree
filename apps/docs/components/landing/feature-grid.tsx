import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

const rows = [
  {
    title: 'CLI',
    detail: 'build · diff · check · init · export',
    href: '/docs/cli',
  },
  {
    title: 'Hooks',
    detail: 'TokensProvider · useToken · useTheme',
    href: '/docs/hooks',
  },
  {
    title: 'MCP',
    detail: 'list · get · resolve · search · diff',
    href: '/docs/mcp',
  },
  {
    title: 'DTCG + Resolver',
    detail: '2025.10 · modes as contexts',
    href: '/docs/concepts/dtcg',
  },
  {
    title: 'Outputs',
    detail: 'CSS · Tailwind v4 · TypeScript · CI',
    href: '/docs/getting-started/pipeline-output',
  },
]

export function FeatureGrid() {
  return (
    <section className='feature-section'>
      <div className='feature-inner'>
        <h2 className='feature-heading'>
          Build and import tokens
          <br />
          from one repository.
        </h2>

        <ul className='feature-list'>
          {rows.map((row, i) => (
            <li
              key={row.title}
              style={{ '--i': i } as React.CSSProperties}>
              <Link
                href={row.href}
                className='feature-row group'>
                <span className='feature-row-title'>{row.title}</span>
                <span className='feature-row-detail'>{row.detail}</span>
                <ArrowUpRight className='feature-row-arrow size-4' />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
