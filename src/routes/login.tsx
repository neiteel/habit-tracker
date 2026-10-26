import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../auth-client'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: '/', search: { filter: 'all' } })
  },
  head: () => ({ meta: [{ title: '登入 · Habit Tracker' }] }),
  component: Login,
})

function Login() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <section className="receipt">
      <h1>HABIT TRACKER</h1>
      <p className="rule" aria-hidden="true" />
      <p>記錄每天的小習慣。</p>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setError('')
          const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' })
          // On success the browser is already leaving for Google; only failures land here.
          if (error) {
            setError(error.message ?? '登入失敗，請再試一次')
            setPending(false)
          }
        }}
      >
        {pending ? '前往 Google…' : '用 Google 繼續'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
