import { RootProvider } from 'fumadocs-ui/provider/next'
import type { Metadata } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'
import './global.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://figmavars.com'),
  title: {
    default: 'FigmaVars',
    template: '%s · FigmaVars',
  },
  description:
    'Turn a Figma variables export into a production design token pipeline. DTCG, CSS, Tailwind, TypeScript, diffing, hooks, MCP.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'FigmaVars',
    description:
      'Turn a Figma variables export into a production design token pipeline.',
    siteName: 'FigmaVars',
  },
}

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='en'
      className={`${inter.variable} ${geistMono.variable}`}
      suppressHydrationWarning>
      <body className='flex min-h-screen flex-col bg-fv-bg font-sans text-fv-text antialiased'>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
