// SSR mode: false. Preferences live in the browser's localStorage, so both the loader and
// the component must run on the client; the server only sends the document shell.
import { createFileRoute, useRouter } from '@tanstack/react-router'

const KEY = 'habit-tracker:reminder'

export const Route = createFileRoute('/settings')({
  ssr: false,
  loader: () => ({ reminder: localStorage.getItem(KEY) ?? '' }),
  pendingComponent: () => <p aria-busy="true">Loading settings…</p>,
  component: Settings,
})

function Settings() {
  const { reminder } = Route.useLoaderData()
  const router = useRouter()
  return (
    <>
      <h1>Settings</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          localStorage.setItem(KEY, String(new FormData(e.currentTarget).get('reminder') ?? ''))
          router.invalidate()
        }}
      >
        <label>
          Daily reminder note (stored on this device) <input name="reminder" defaultValue={reminder} />
        </label>{' '}
        <button>Save</button>
      </form>
      {reminder && <p>Current: “{reminder}”</p>}
    </>
  )
}
