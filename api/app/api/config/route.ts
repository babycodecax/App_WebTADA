import { NextResponse } from 'next/server'

// force-dynamic — config đọc env biến thiên theo môi trường (local/Vercel),
// không được static prerender (frozen) tại build time.
export const dynamic = 'force-dynamic'

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
