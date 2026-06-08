const lines = [
  { indent: 0, kind: 'dir', text: 'design-tokens/' },
  { indent: 1, kind: 'dir', text: 'tokens/' },
  { indent: 2, kind: 'file', text: 'primitives.tokens.json' },
  { indent: 2, kind: 'file', text: 'semantic.tokens.json' },
  { indent: 2, kind: 'file', text: 'semantic.dark.tokens.json' },
  { indent: 2, kind: 'key', text: 'tokens.resolver.json' },
  { indent: 1, kind: 'dir', text: 'css/' },
  { indent: 2, kind: 'file', text: 'tokens.css' },
  { indent: 2, kind: 'file', text: 'tokens.tailwind.css' },
  { indent: 1, kind: 'file', text: 'ts/tokens.ts' },
  { indent: 1, kind: 'file', text: 'style-dictionary.config.mjs' },
  { indent: 1, kind: 'file', text: 'design-tokens.workflow.yml' },
]

function prefix(indent: number, last: boolean) {
  if (indent === 0) {
    return ''
  }
  const branch = last ? '└── ' : '├── '
  const pad = '│   '.repeat(Math.max(0, indent - 1))
  return pad + branch
}

export function PipelinePreview() {
  return (
    <section className='pipeline-section'>
      <div className='pipeline-inner'>
        <div className='pipeline-copy'>
          <h2 className='pipeline-heading'>
            Converters stop at JSON.
            <br />
            You need the repo.
          </h2>
          <p className='pipeline-lede'>
            Resolver contexts for Figma modes. Theme selectors in CSS. Tailwind{' '}
            <code>@theme</code>. Typed paths. A GitHub Action you can actually
            commit.
          </p>
        </div>

        <div className='pipeline-tree-wrap'>
          <p className='pipeline-tree-label'>figma-vars build variables.json</p>
          <pre className='pipeline-tree'>
            <code>
              {lines.map((line, i) => (
                <span
                  key={line.text}
                  className='pipeline-line'
                  style={{ '--i': i } as React.CSSProperties}>
                  <span className='text-fv-dim'>
                    {prefix(line.indent, i === lines.length - 1)}
                  </span>
                  <span className={`syntax-${line.kind}`}>{line.text}</span>
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  )
}
