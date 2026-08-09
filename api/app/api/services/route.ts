import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * force-dynamic — BẮT BUỘC chống static prerender:
 * Trước đây route này bị Next.js tối ưu GET thành tĩnh (frozen tại build time,
 * revalidate=false) vì handler không dùng req — nội dung admin vừa lưu KHÔNG
 * BAO GIỜ hiển thị cho tới khi deploy lại. force-dynamic ép chạy trên mỗi
 * request → admin lưu → F5 là thấy nội dung mới ngay.
 */
export const dynamic = 'force-dynamic';

/** Cột group_name của hàng sentinel chứa toàn bộ nội dung văn bản dịch vụ. */
const SERVICES_CONTENT_ROW = '__services_content__';

/**
 * GET /api/services — nội dung dịch vụ landing page (public, không cần auth).
 *
 * Trả về toàn bộ nội dung dịch vụ dưới dạng 1 văn bản thuần (mỗi dòng 1 dịch vụ,
 * admin tự viết, có thể kèm emoji). Trang chủ hiển thị đúng 1-1 theo nội dung này.
 *
 * Query hàng sentinel (group_name = __services_content__):
 *   - Ưu tiên is_active = true;
 *   - Nếu không tìm thấy (row null) → fallback query bỏ filter is_active
 *     (phòng trường hợp RLS/trigger làm is_active sai, nội dung vẫn hiển thị).
 *
 * Response: { "content": "🏠 Kế toán dịch vụ trọn gói\n..." }
 * Không cache dài — mỗi lần mở trang chủ là lấy nội dung mới nhất.
 */
export async function GET(req: NextRequest) {
  try {
    // Đọc req.url để ép Next runtime dynamic (không prerender tĩnh) — bản 14.2
    // vẫn có thể static prerender route không dùng req dù force-dynamic.
    const _url = req.url;
    const sb = getSupabase();

    const { data: row, error } = await sb
      .from('landing_services')
      .select('description')
      .eq('is_active', true)
      .eq('group_name', SERVICES_CONTENT_ROW)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[services] Lỗi query is_active=true: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: RESPONSE_HEADERS,
      });
    }

    // Fallback: row null (không tìm thấy hàng active) → thử query không filter is_active
    if (!row) {
      const { data: fallbackRow, error: fallbackErr } = await sb
        .from('landing_services')
        .select('description, is_active')
        .eq('group_name', SERVICES_CONTENT_ROW)
        .limit(1)
        .maybeSingle();

      if (fallbackErr) {
        console.error(`[services] Lỗi query fallback: ${fallbackErr.message}`);
        return new Response(JSON.stringify({ error: fallbackErr.message }), {
          status: 500,
          headers: RESPONSE_HEADERS,
        });
      }
      if (fallbackRow) {
        console.warn(
          `[services] Hàng sentinel tồn tại nhưng is_active=${fallbackRow.is_active} — dùng fallback query`
        );
      }
      return new Response(JSON.stringify({ content: fallbackRow?.description || '' }), {
        headers: RESPONSE_HEADERS,
      });
    }

    return new Response(JSON.stringify({ content: row.description || '' }), {
      headers: RESPONSE_HEADERS,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    console.error(`[services] Lỗi không xác định: ${msg}`);
    return new Response(JSON.stringify({ error: `Lỗi lấy nội dung dịch vụ: ${msg}` }), {
      status: 500,
      headers: RESPONSE_HEADERS,
    });
  }
}

/**
 * Header phản hồi — chống cache ở mọi tầng:
 *  - Cache-Control: no-store cho trình duyệt;
 *  - Vercel-CDN-Cache-Control: no-cache cho CDN edge (Vercel tôn trọng header
 *    riêng này với API routes; nếu bỏ qua, CDN có thể cache mặc định dù
 *    response JSON nhỏ);
 *  - X-Content-Type-Options: chuẩn bảo mật.
 */
const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  'Vercel-CDN-Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};