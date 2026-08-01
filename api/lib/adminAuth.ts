/**
 * adminAuth.ts — Kiểm tra admin token dùng chung cho các route /api/admin.
 *
 * So sánh Bearer token với ADMIN_PASSWORD bằng timingSafeEqual (chống timing attack).
 * Nếu ADMIN_PASSWORD chưa cấu hình → từ chối (fail-closed).
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isAdmin(req: NextRequest): boolean {
  if (!ADMIN_PASSWORD) return false;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  return safeEqual(auth.slice(7), ADMIN_PASSWORD);
}
