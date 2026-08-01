import { NextRequest, NextResponse } from 'next/server';
import { getCachedResult } from '@/lib/audit/cache';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const data = getCachedResult(id);
    if (!data) {
      return NextResponse.json(
        { error: 'Không tìm thấy kết quả audit', audit_id: id },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Audit result error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
