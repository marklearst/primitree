import { type HighlightOptions, highlight } from 'fumadocs-core/highlight'
import { type ComponentProps, Fragment } from 'react'
import { CopyButton } from '@/components/landing/copy-button'
import { cn } from '@/lib/cn'
import { inkTheme, inkTokens, REFERENCE_PATTERN } from '@/lib/landing/ink-theme'
import { inkReads, reads } from '@/lib/tokens/bind'

type Transformer = NonNullable<HighlightOptions['transformers']>[number]

/** Writes each span's color as its token, and gives DTCG alias strings the
 * reference color, so a sample retunes with the page. */
const tokenColors: Transformer = {
  name: 'primitree-token-colors',
  span(node, _line, _col, _lineElement, token) {
    if (REFERENCE_PATTERN.test(token.content.trim())) {
      node.properties.style = 'color:var(--semantic-syntax-reference)'
      node.properties['data-reference'] = ''
      return
    }
    const style = String(node.properties.style ?? '')
    const placeholder = style.match(/#[\da-f]{6}/iu)?.[0]?.toLowerCase()
    const color = placeholder === undefined ? undefined : inkTokens[placeholder]
    if (color !== undefined) {
      node.properties.style = `color:${color}`
    }
  },
}

function Panel(props: ComponentProps<'pre'>) {
  return (
    <pre
      {...props}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a code panel that scrolls sideways must take focus so keyboard users can scroll it
      tabIndex={0}
      className='code-panel-pre'
      style={undefined}
    />
  )
}

/** The raised card paints these through its class. */
const plainReads = reads(
  'semantic.surface.raised',
  'semantic.border.subtle',
  'component.code.radius',
  'semantic.text.primary'
)

/** A plain sample names no language, since nothing highlights it. */
type Source =
  | { plain: true; lang?: undefined }
  | { plain?: false; lang: 'json' | 'ts' | 'css' | 'bash' | 'yaml' }

/** A file or excerpt in a panel, rendered on the server. A file from this repo
 * or output from a run highlights on the code panel; a sample written for the
 * page prints plain on the raised card. The file name heads the panel and may
 * wrap after a slash; long lines scroll inside it. */
export async function CodePanel({
  code,
  lang,
  title,
  note,
  copy = false,
  plain,
  className,
}: Source & {
  code: string
  title: string
  note?: string
  copy?: boolean
  className?: string
}) {
  const rendered = plain ? (
    <Panel>
      <code>{code}</code>
    </Panel>
  ) : (
    await highlight(code, {
      lang,
      theme: inkTheme,
      transformers: [tokenColors],
      components: { pre: Panel },
    })
  )
  return (
    <figure
      className={cn('code-panel', className)}
      data-plain={plain ? '' : undefined}
      {...(plain ? plainReads : inkReads)}>
      <figcaption className='code-panel-head'>
        <span className='code-panel-name'>
          <code className='code-panel-title'>
            {title.split('/').map((part, index, parts) => (
              <Fragment key={part}>
                {part}
                {index < parts.length - 1 ? (
                  <>
                    /<wbr />
                  </>
                ) : null}
              </Fragment>
            ))}
          </code>
          {note === undefined ? null : <span>{note}</span>}
        </span>
        {copy ? (
          <CopyButton
            text={code}
            label={title}
          />
        ) : null}
      </figcaption>
      {rendered}
    </figure>
  )
}
