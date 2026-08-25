import { RootProvider } from 'fumadocs-ui/provider/next'
import { IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google'
import { siteMetadata } from '@/lib/discovery'
import './global.css'

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-schibsted',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
})

export const metadata = siteMetadata

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='en'
      className={`${schibsted.variable} ${plexMono.variable}`}
      suppressHydrationWarning>
      <body className='flex min-h-screen flex-col bg-primitree-bg font-sans text-primitree-text antialiased'>
        <RootProvider
          theme={{
            attribute: ['class', 'data-theme'],
            defaultTheme: 'dark',
            enableSystem: false,
          }}>
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
