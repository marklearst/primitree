import { Fragment } from 'react'
import { packageManagers, runPrefixes } from '@/lib/landing/package-managers'

/** Command words that wrap between words and never inside a flag such as
 * `--source`. A long file path may also wrap after a slash. */
export function CommandWords({ text }: { text: string }) {
  // Each word is keyed by where it starts in the command.
  let offset = 0
  return text.split(' ').map(word => {
    const start = offset
    offset += word.length + 1
    const parts = word.split('/')
    return (
      <Fragment key={start}>
        {start === 0 ? null : ' '}
        {word.startsWith('-') ? (
          <span className='nowrap'>{word}</span>
        ) : (
          parts.map((part, index) => (
            <Fragment key={`${start}:${parts.slice(0, index + 1).join('/')}`}>
              {part}
              {index < parts.length - 1 ? (
                <>
                  /<wbr />
                </>
              ) : null}
            </Fragment>
          ))
        )}
      </Fragment>
    )
  })
}

/** A `primitree` command written the way the visitor's package manager runs
 * it. All four prefixes render; CSS keyed on the root's
 * `data-package-manager` shows one, so the right command paints first. */
export function RunCommand({
  args,
  prompt = true,
}: {
  args: string
  prompt?: boolean
}) {
  return (
    <span className='run-command'>
      {prompt ? (
        <span
          className='run-prompt'
          aria-hidden='true'>
          ${' '}
        </span>
      ) : null}
      {packageManagers.map(manager => (
        <span
          key={manager}
          className='pm-only'
          data-pm={manager}>
          {runPrefixes[manager]}
        </span>
      ))}{' '}
      <CommandWords text={args} />
    </span>
  )
}
