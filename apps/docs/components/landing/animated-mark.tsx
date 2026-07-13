'use client'

import { useEffect, useRef, useState } from 'react'

const MARK_PATH =
  'M36.76 85.34L41.7 58.07L37.3 60.88C20.85 71.1 -1.72 58.7 0.1 38.87C1.36 25.27 10.05 13.33 21.66 6.62C48.59 -8.95 89.6 3.69 94.62 36.67C97.83 57.79 76.07 71.48 58.03 60.92L53.42 58.06L58.23 85.33H36.76V85.34ZM42.44 8.69C38.52 8.99 34.65 9.87 31.04 11.39L30.99 34.53L42.45 41.4V8.69H42.44ZM52.56 8.88V19.19L64.9 12.09C64.95 11.83 64.8 11.92 64.65 11.85C61.71 10.44 57.91 9.45 54.68 8.98C54.13 8.9 53.34 8.74 52.81 8.75C52.7 8.75 52.59 8.77 52.56 8.88ZM22.44 16.59L20.22 18.25C18.14 20.3 16.03 22.37 14.54 24.91L22.44 29.42V16.58V16.59ZM52.56 41.28L80.7 24.81C79.28 22.73 77.66 20.56 75.77 18.88C75.56 18.69 74.41 17.69 74.28 17.64C74.06 17.54 73.89 17.72 73.71 17.81L52.72 30.33L52.57 41.28H52.56ZM10.35 32.88C9.18 37.97 8.35 43.02 11.07 47.77C14.73 54.18 22.78 56.77 29.67 54.35C32.54 53.34 35.47 51.47 37.63 49.35L10.36 32.87L10.35 32.88ZM84.46 32.89L57.62 49.48C63.17 55.44 71.96 57.46 79.08 52.93C85.1 49.1 86.82 43.04 85.45 36.21C85.38 35.86 84.63 32.88 84.46 32.88V32.89Z'

const NODES = [
  { cx: 47, cy: 24, label: 'primitives', delay: 0 },
  { cx: 78, cy: 38, label: 'semantic', delay: 0.4 },
  { cx: 22, cy: 42, label: 'modes', delay: 0.8 },
  { cx: 47, cy: 68, label: 'resolver', delay: 1.2 },
] as const

export function AnimatedMark({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reduced) {
      return
    }

    const el = ref.current
    if (!el) {
      return
    }

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const x = (e.clientX - cx) / rect.width
      const y = (e.clientY - cy) / rect.height
      setTilt({ x: x * 10, y: y * -10 })
    }

    const onLeave = () => setTilt({ x: 0, y: 0 })

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [reduced])

  return (
    <div
      ref={ref}
      className={`mark-stage ${className ?? ''}`}
      style={
        reduced
          ? undefined
          : {
              transform: `perspective(900px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
            }
      }>
      <div
        className='mark-glow'
        aria-hidden
      />
      <div
        className='mark-ring mark-ring-1'
        aria-hidden
      />
      <div
        className='mark-ring mark-ring-2'
        aria-hidden
      />

      {/* biome-ignore lint/a11y/noSvgWithoutTitle: This animated illustration is decorative and hidden from assistive technology. */}
      <svg
        viewBox='0 0 95 86'
        className='mark-svg'
        aria-hidden
        fill='none'>
        <defs>
          <linearGradient
            id='mark-fill'
            x1='0%'
            y1='0%'
            x2='100%'
            y2='100%'>
            <stop
              offset='0%'
              stopColor='#ffffff'
            />
            <stop
              offset='45%'
              stopColor='#c7d2fe'
            />
            <stop
              offset='100%'
              stopColor='#8b9cff'
            />
          </linearGradient>
          <linearGradient
            id='mark-sheen'
            x1='0%'
            y1='0%'
            x2='100%'
            y2='0%'>
            <stop
              offset='0%'
              stopColor='white'
              stopOpacity='0'
            />
            <stop
              offset='50%'
              stopColor='white'
              stopOpacity='0.35'
            />
            <stop
              offset='100%'
              stopColor='white'
              stopOpacity='0'
            />
          </linearGradient>
          <filter id='mark-blur'>
            <feGaussianBlur
              stdDeviation='3'
              result='blur'
            />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
        </defs>

        <path
          className='mark-ghost'
          d={MARK_PATH}
          fill='white'
          fillOpacity='0.04'
        />
        <path
          className='mark-ghost mark-ghost-2'
          d={MARK_PATH}
          fill='white'
          fillOpacity='0.06'
        />
        <path
          className='mark-body'
          d={MARK_PATH}
          fill='url(#mark-fill)'
        />
        <path
          className='mark-sheen'
          d={MARK_PATH}
          fill='url(#mark-sheen)'
          style={{ mixBlendMode: 'overlay' }}
        />

        {NODES.map(node => (
          <g
            key={node.label}
            className='mark-node'
            style={{ '--d': `${node.delay}s` } as React.CSSProperties}>
            <circle
              cx={node.cx}
              cy={node.cy}
              r='2.5'
              className='mark-node-dot'
            />
            <circle
              cx={node.cx}
              cy={node.cy}
              r='8'
              className='mark-node-pulse'
            />
          </g>
        ))}
      </svg>

      <div
        className='mark-labels'
        aria-hidden>
        {NODES.map(node => (
          <span
            key={node.label}
            className='mark-label'
            style={
              {
                '--lx': `${(node.cx / 95) * 100}%`,
                '--ly': `${(node.cy / 86) * 100}%`,
                '--d': `${node.delay}s`,
              } as React.CSSProperties
            }>
            {node.label}
          </span>
        ))}
      </div>
    </div>
  )
}
