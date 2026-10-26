import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Habit Tracker' },
    ],
  }),
  // The document shell is always server-rendered, even for routes with ssr: false/'data-only'.
  shellComponent: RootDocument,
  component: () => <Outlet />,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{css}</style>
      </head>
      <body>
        <nav>
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>Today</Link>
          <Link to="/insights">Insights</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        <main>{children}</main>
        <Scripts />
      </body>
    </html>
  )
}

const css = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { max-width: 40rem; margin: 0 auto; padding: 1rem; }
nav { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
nav a.active { font-weight: 700; }
ul { list-style: none; padding: 0; }
li { display: flex; align-items: center; gap: .5rem; padding: .4rem 0; }
.grid { display: grid; grid-template-columns: repeat(10, 1.5rem); gap: 3px; }
.cell { width: 1.5rem; height: 1.5rem; border-radius: 3px; background: #8884; }
.cell[data-done="true"] { background: #2a9d4b; }
`
