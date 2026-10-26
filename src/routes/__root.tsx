import { HeadContent, Link, Outlet, Scripts, createRootRoute, redirect, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import geistMono from '@fontsource-variable/geist-mono?url'
import notoSansTc from '@fontsource-variable/noto-sans-tc?url'
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
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Habit Tracker' },
    ],
    // Self-hosted via Fontsource (SPEC.md D13); Noto Sans TC is split by unicode-range.
    links: [
      { rel: 'stylesheet', href: geistMono },
      { rel: 'stylesheet', href: notoSansTc },
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
        <nav>
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>今日</Link>
          <Link to="/insights">洞察</Link>
          <Link to="/settings">設定</Link>
          <button
            className="link"
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
        <style>{css}</style>
      </head>
      <body>
        <main>{children}</main>
        <Scripts />
      </body>
    </html>
  )
}

// Thermal-receipt look (SPEC.md D11): pure black on pure white, no dark mode, no shadows.
const zigzag = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='6'%3E%3Cpath d='M0 6 6 0 12 6' fill='none' stroke='black'/%3E%3C/svg%3E")`
const css = `
:root { --paper: #fff; --ink: #000; color-scheme: light; font-family: 'Geist Mono Variable', 'Noto Sans TC Variable', monospace; }
body { background: var(--paper); color: var(--ink); max-width: 40rem; margin: 0 auto; padding: 1rem; }
nav { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
nav a { color: var(--ink); }
nav a.active { font-weight: 700; }
button { font: inherit; color: var(--ink); background: var(--paper); border: 1px solid var(--ink); padding: .5rem 1rem; cursor: pointer; }
button:disabled { cursor: progress; }
button.link { border: 0; padding: 0; text-decoration: underline; }
.receipt { position: relative; border-inline: 1px solid var(--ink); padding: 1.5rem 1rem; }
.receipt::before, .receipt::after { content: ''; position: absolute; inset-inline: -1px; height: 6px; background: ${zigzag} repeat-x; }
.receipt::before { top: -6px; }
.receipt::after { bottom: -6px; transform: scaleY(-1); }
.rule { border-top: 1px dashed var(--ink); margin: 1rem 0; }
ul { list-style: none; padding: 0; }
li { display: flex; align-items: center; gap: .5rem; padding: .4rem 0; }
.grid { display: grid; grid-template-columns: repeat(10, 1.5rem); gap: 3px; }
.cell { width: 1.5rem; height: 1.5rem; border: 1px solid var(--ink); }
.cell[data-done="true"] { background: var(--ink); }
`
