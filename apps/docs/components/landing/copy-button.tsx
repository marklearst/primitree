'use client'

import { type RefObject, useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon, XIcon } from '@/components/icons'

type CopyState = 'idle' | 'copied' | 'failed'

/** Writes text to the clipboard and reports whether the write landed. The
 * Clipboard API comes first; a hidden textarea with execCommand covers
 * browsers that block it. Both paths return false on failure, so the caller
 * never claims a copy that did not happen. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea route.
  }
  // The textarea takes focus and the selection to copy, so both go back
  // where the reader left them afterward.
  const focused = document.activeElement
  const selection = window.getSelection()
  const ranges = Array.from(
    { length: selection?.rangeCount ?? 0 },
    (_, index) => selection?.getRangeAt(index)
  )
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    // execCommand threw: the browser refused the copy.
  }
  area.remove()
  if (focused instanceof HTMLElement) {
    focused.focus({ preventScroll: true })
  }
  selection?.removeAllRanges()
  for (const range of ranges) {
    if (range !== undefined) {
      selection?.addRange(range)
    }
  }
  return copied
}

/** Selects the shown command, so a failed copy leaves it ready for a manual
 * copy with the keyboard. */
function selectText(element: HTMLElement | null) {
  const selection = window.getSelection()
  if (element === null || selection === null) {
    return
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

const FAILURE =
  'Copy failed: your browser blocked the clipboard. Select the text and copy it by hand.'

/** A copy control with an honest result. It reads "Copied" once the
 * clipboard accepts the text and "Failed" when it refuses. A failure also
 * selects the command and leaves a visible note that stays until the next
 * attempt; a live region announces either outcome. */
export function CopyButton({
  text,
  label = text,
  target,
}: {
  text: string
  /** What the accessible name calls the text, when the text is a whole file
   * and too long to read aloud. */
  label?: string
  /** The element that shows the command, selected when the copy fails. */
  target?: RefObject<HTMLElement | null>
}) {
  const [state, setState] = useState<CopyState>('idle')
  const [outcome, setOutcome] = useState<{ copied: boolean } | null>(null)
  // A different command clears the last outcome, so switching back never
  // brings back a note or an announcement for a copy that did not run.
  const [outcomeFor, setOutcomeFor] = useState(text)
  if (outcomeFor !== text) {
    setOutcomeFor(text)
    setOutcome(null)
    setState('idle')
  }
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onClick = async () => {
    window.clearTimeout(timer.current)
    // Emptying the live region first lets a repeat copy announce again.
    setOutcome(null)
    const copied = await writeClipboard(text)
    setState(copied ? 'copied' : 'failed')
    setOutcome({ copied })
    if (!copied) {
      selectText(target?.current ?? null)
    }
    timer.current = window.setTimeout(
      () => setState('idle'),
      copied ? 1600 : 4000
    )
  }

  const message =
    outcome === null ? '' : outcome.copied ? `Copied ${label}` : FAILURE

  return (
    <>
      <button
        type='button'
        className='copy-button'
        data-state={state}
        aria-label={`Copy ${label}`}
        onClick={onClick}>
        <span
          className='copy-button-icons'
          aria-hidden='true'>
          <CopyIcon size={16} />
          <CheckIcon size={16} />
          <XIcon size={16} />
        </span>
        <span
          className='copy-button-label'
          aria-hidden='true'>
          <span data-for='idle'>Copy</span>
          <span data-for='copied'>Copied</span>
          <span data-for='failed'>Failed</span>
        </span>
      </button>
      <span
        className='copy-status'
        data-visible={outcome?.copied === false ? '' : undefined}
        role='status'
        aria-live='polite'>
        {message}
      </span>
    </>
  )
}
