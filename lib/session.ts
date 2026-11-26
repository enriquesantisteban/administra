import 'server-only'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export async function getSignedInUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('UNAUTHORIZED')
  const allowed = process.env.AUTHORIZED_EMAIL?.trim().toLowerCase()
  if (allowed && session.user.email.toLowerCase() !== allowed) throw new Error('UNAUTHORIZED')
  return session.user
}
