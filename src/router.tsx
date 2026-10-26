import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: () => <p>Not found.</p>,
    defaultErrorComponent: ({ error }) => <p role="alert">Something went wrong: {error instanceof Error ? error.message : String(error)}</p>,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
