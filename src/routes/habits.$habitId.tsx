// SSR mode: full. A shareable, linkable page whose content is fully known on the server.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { deleteHabit, getHabit } from '../habits'

export const Route = createFileRoute('/habits/$habitId')({
  loader: ({ params }) => getHabit({ data: { id: params.habitId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? 'Habit'} · Habit Tracker` }] }),
  notFoundComponent: () => <p>That habit doesn't exist.</p>,
  component: HabitPage,
})

function HabitPage() {
  const habit = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <>
      <h1>{habit.name}</h1>
      <p>Current streak: {habit.streak} · Total days done: {habit.checkIns.length}</p>
      <button
        onClick={async () => {
          await deleteHabit({ data: { id: habit.id } })
          navigate({ to: '/', search: { filter: 'all' } })
        }}
      >
        Delete habit
      </button>
    </>
  )
}
