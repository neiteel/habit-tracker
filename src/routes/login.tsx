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
    <div className="sheet hero">
      <section className="receipt" aria-labelledby="login-title">
        <header className="masthead">
          <span className="eyebrow">Daily Record</span>
          <h1 id="login-title" className="brand">Habit Tracker</h1>
          <span className="meta">No. 0001</span>
        </header>
        <hr className="rule" />
        <p className="tagline">每天一個小勾，<br />印成一張屬於自己的收據。</p>
        <hr className="rule" />
        <button
          className="btn"
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
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="barcode" aria-hidden="true" />
        <p className="footnote meta">Thank you · 明天見</p>
      </section>
    </div>
  )
}
