import { NextResponse } from 'next/server'
import { getGoogleSheetsErrorDetails, getRentalSpreadsheet, getSignedInUser } from '@/lib/google-sheets'

export async function GET() {
  try {
    await getSignedInUser()
    const data = await getRentalSpreadsheet()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const details = getGoogleSheetsErrorDetails(error)
    console.error('Google Sheets read failed', { status: details.status, code: details.code, providerMessage: details.providerMessage })
    return NextResponse.json({ error: details.message }, { status: 502 })
  }
}
