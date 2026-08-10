/**
 * adminAuth.ts — Kiểm tra admin token dùng chung cho các route /api/admin.
 *
 * THỐNG NHẤT: chỉ dùng TÀI KHOẢN GOOGLE được cấp quyền (ADMIN_EMAILS).
 * Bỏ mật khẩu ADMIN_PASSWORD — isAdminGoogle verify JWT access token của
 * Supabase (Google OAuth) rồi so email với danh sách ADMIN_EMAILS.
 */
import { NextRequest } from 'next/server';
import { getSupabase } from './supabase';

/**
 * isAdminGoogle — token Google hợp lệ + email ∈ ADMIN_EMAILS.
 * Dùng cho MỌI route /api/admin (Quản lý tài liệu, Dịch vụ, blog).
 */
export async function isAdminGoogle(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;

  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user?.email) return false;
    const email = data.user.email.toLowerCase();
    const admins = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return admins.includes(email);
  } catch {
    return false;
  }
}

/** Lấy email từ Bearer token Google (nếu token hợp lệ) — dùng cho author_email. */
export async function getAdminEmailFromToken(req: NextRequest): Promise<string> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return '';
  const token = auth.slice(7).trim();
  if (!token) return '';
  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user?.email) return '';
    return data.user.email.toLowerCase();
  } catch {
    return '';
  }
}
