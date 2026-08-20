'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyCommand({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      clearTimeout(timer.current)
    }
  }, [])

  return (
    <button
      type='button'
      className='copy-command'
      aria-label={label}
      data-copied={copied || undefined}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 2000)
        })
      }}>
      {copied ? (
        <Check
          aria-hidden='true'
          size={14}
        />
      ) : (
        <Copy
          aria-hidden='true'
          size={14}
        />
      )}
    </button>
  )
}
