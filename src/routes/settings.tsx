import { createFileRoute } from '@tanstack/react-router'

// Time zone and day-start settings arrive in T15 (SPEC-habits §3).
export const Route = createFileRoute('/settings')({
  component: Settings,
})

function Settings() {
  const { user } = Route.useRouteContext()
  return (
    <div className="sheet">
      <section className="receipt" aria-labelledby="settings-title">
        <header className="masthead">
          <span className="eyebrow">Account</span>
          <h1 id="settings-title">設定</h1>
        </header>
        <hr className="rule" />
        <div className="totals">
          <div className="line"><span>名稱</span><span className="leader" /><span className="value">{user?.name}</span></div>
          <div className="line"><span>帳號</span><span className="leader" /><span className="value">{user?.email}</span></div>
        </div>
      </section>
    </div>
  )
}
