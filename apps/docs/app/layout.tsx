import { RootProvider } from 'fumadocs-ui/provider/next'
import { preload } from 'react-dom'
import { DocsLink } from '@/components/docs-link'
import { SearchFocusReturn } from '@/components/search-focus-return'
import { siteMetadata } from '@/lib/discovery'
import { packageManagerScript } from '@/lib/landing/package-managers'
import { themeReplayScript } from '@/lib/tokens/theme-script'
import './fonts.css'
import './monolisa.css'
import './global.css'

export const metadata = siteMetadata

const fontPreload = {
  as: 'font',
  type: 'font/woff2',
  crossOrigin: 'anonymous',
} as const

export default function Layout({ children }: LayoutProps<'/'>) {
  preload('/fonts/wotfard/wotfard-regular-webfont.woff2', fontPreload)
  preload('/fonts/wotfard/wotfard-medium-webfont.woff2', fontPreload)
  preload('/fonts/monolisa/0-MonoLisa-normal.woff2', fontPreload)
  return (
    <html
      lang='en'
      suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a static, build-time string that must run before first paint */}
        <script dangerouslySetInnerHTML={{ __html: packageManagerScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a static, build-time string that must run before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeReplayScript }} />
      </head>
      <body className='flex min-h-screen flex-col bg-primitree-bg font-sans text-primitree-text antialiased'>
        <RootProvider
          components={{ Link: DocsLink }}
          theme={{
            attribute: ['class', 'data-theme'],
            defaultTheme: 'system',
            disableTransitionOnChange: true,
            enableSystem: true,
          }}>
          <SearchFocusReturn />
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
