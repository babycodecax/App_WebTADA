import { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ServiceRow {
  id: string;
  group_name: string;
  group_emoji: string;
  sort_order: number;
  name: string;
  description: string;
  features: string[] | unknown;
}

interface ServiceGroup {
  name: string;
  emoji: string;
  items: Array<{
    id: string;
    name: string;
    description: string;
    features: string[];
  }>;
}

/**
 * GET /api/services — danh sách dịch vụ landing page (public, không cần auth).
 *
 * Trả về các dịch vụ is_active = true, gom theo nhóm:
 * {
 *   "groups": [
 *     { "name": "Hộ kinh doanh & Doanh nghiệp", "emoji": "🏠", "items": [...] },
 *     { "name": "Cá nhân/Người lao động", "emoji": "🌟", "items": [...] }
 *   ]
 * }
 * Thứ tự: group theo sort_order của mục đầu tiên trong nhóm, item theo sort_order.
 */
export async function GET(_req: NextRequest) {
  try {
    const { data: rows, error } = await getSupabase()
      .from('landing_services')
      .select('id,group_name,group_emoji,sort_order,name,description,features')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const groups = new Map<string, ServiceGroup>();
    const groupOrder: string[] = [];

    for (const row of (rows || []) as ServiceRow[]) {
      let group = groups.get(row.group_name);
      if (!group) {
        group = { name: row.group_name, emoji: row.group_emoji || '', items: [] };
        groups.set(row.group_name, group);
        groupOrder.push(row.group_name);
      }
      group.items.push({
        id: row.id,
        name: row.name,
        description: row.description || '',
        features: Array.isArray(row.features) ? row.features : [],
      });
    }

    const result = groupOrder.map((name) => groups.get(name)!);
    return new Response(JSON.stringify({ groups: result }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
    return new Response(JSON.stringify({ error: `Lỗi lấy danh sách dịch vụ: ${msg}` }), { status: 500 });
  }
}