import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    adminEmails,
  })
}
