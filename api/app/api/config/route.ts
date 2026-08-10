import { NextResponse } from 'next/server'

// force-dynamic — config đọc env biến thiên theo môi trường (local/Vercel),
// không được static prerender (frozen) tại build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/config — cấu hình public cho frontend (Supabase anon key).
 *
 * BẢO MẬT (fix review 2026-08-10): KHÔNG trả ADMIN_EMAILS ra client — danh
 * sách email admin là thông tin nhạy cảm (giúp kẻ tấn công nhắm đúng tài
 * khoản). Quyền admin chỉ kiểm tra ở SERVER qua /api/admin/check.
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
  })
}