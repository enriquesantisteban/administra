import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ExpensesDashboard } from '@/components/expenses-dashboard'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const authorizedEmail = process.env.AUTHORIZED_EMAIL?.trim().toLowerCase()
  if (authorizedEmail && session.user.email.toLowerCase() !== authorizedEmail) redirect('/sign-in?error=unauthorized')
  return <ExpensesDashboard user={{ name: session.user.name, email: session.user.email }} />
}
