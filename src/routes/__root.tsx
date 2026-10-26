/// <reference types="vite/client" />
import { HeadContent, Link, Outlet, Scripts, createRootRoute, redirect, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import geistMono from '@fontsource-variable/geist-mono?url'
import notoSansTc from '@fontsource-variable/noto-sans-tc?url'
import appCss from '../styles.css?url'
import { authClient } from '../auth-client'
import { getSessionUser } from '../session'

export const Route = createRootRoute({
  // Every page except /login needs a signed-in user; children read it from context.
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser()
    if (!user && location.pathname !== '/login') throw redirect({ to: '/login' })
    return { user }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#ffffff' },
      { title: 'Habit Tracker' },
    ],
    // Fonts are self-hosted via Fontsource (SPEC.md D13); Noto Sans TC is split by unicode-range.
    links: [
      { rel: 'stylesheet', href: geistMono },
      { rel: 'stylesheet', href: notoSansTc },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  // The document shell is always server-rendered, even for routes with ssr: false/'data-only'.
  shellComponent: RootDocument,
  component: Layout,
})

function Layout() {
  const { user } = Route.useRouteContext()
  const router = useRouter()
  return (
    <>
      {user && (
        <nav aria-label="主要">
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>今日</Link>
          <Link to="/insights">紀錄</Link>
          <Link to="/settings">設定</Link>
          <button
            onClick={async () => {
              await authClient.signOut()
              await router.invalidate() // re-runs beforeLoad, which sends us to /login
            }}
          >
            登出
          </button>
        </nav>
      )}
      <Outlet />
    </>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <HeadContent />
      </head>
      <body>
        <main>{children}</main>
        <Scripts />
      </body>
    </html>
  )
}
