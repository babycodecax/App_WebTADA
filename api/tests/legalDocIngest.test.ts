/**
 * Unit tests — lib/legalDocIngest.ts (parse .docx → title tiếng Việt chuẩn).
 *
 * Fixtures HTML là kết quả mammoth.convertToHtml THẬT từ các file .docx
 * trong D:\VB luật\Kế toán, thuế (chụp phần đầu văn bản — giữ cấu trúc
 * bảng tiêu đề + anchor loai_1/loai_1_name của VBPL).
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/legalDocIngest.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'legalDocIngest.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

// =========================================================================
// Fixtures — mammoth HTML thật (phần đầu mỗi văn bản)
// =========================================================================

/** 109_2025_QH15_665870.docx — LUẬT, "Luật số: 109/2025/QH15", name trong <strong> */
const HTML_LUAT_109 =
  '<table><tr><td><p><strong>QUỐC HỘI<br />-------</strong></p></td>' +
  '<td><p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc <br />---------------</strong></p></td></tr>' +
  '<tr><td><p>Luật số: 109/2025/QH15</p></td><td><p><em>Hà Nội, ngày 10 tháng 12 năm 2025</em></p></td></tr></table>' +
  '<p> </p><p><a id="loai_1"></a><strong>LUẬT</strong></p>' +
  '<p><a id="loai_1_name"></a><strong>THUẾ THU NHẬP CÁ NHÂN</strong></p>' +
  '<p><em>Căn cứ </em><a id="tvpllink_khhhnejlqt"></a><em>Hiến pháp nước Cộng hòa xã hội chủ nghĩa Việt Nam</em></p>';

/** 141_2026_ND-CP_703882.docx — NGHỊ ĐỊNH, name KHÔNG strong (text trần) */
const HTML_ND_141 =
  '<table><tr><td><p><strong>CHÍNH PHỦ<br />--------</strong></p></td>' +
  '<td><p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc <br />---------------</strong></p></td></tr>' +
  '<tr><td><p>Số: 141/2026/NĐ-CP</p></td><td><p><em>Hà Nội, ngày 29 tháng 4 năm 2026</em></p></td></tr></table>' +
  '<p> </p><p><a id="loai_1"></a><strong>NGHỊ ĐỊNH</strong></p>' +
  '<p><a id="loai_1_name"></a>SỬA ĐỔI, BỔ SUNG MỘT SỐ ĐIỀU CỦA NGHỊ ĐỊNH SỐ 68/2026/NĐ-CP QUY ĐỊNH VỀ CHÍNH SÁCH THUẾ ĐỐI VỚI HỘ KINH DOANH, CÁ NHÂN KINH DOANH VÀ NGHỊ ĐỊNH SỐ 320/2025/NĐ-CP QUY ĐỊNH CHI TIẾT MỘT SỐ ĐIỀU VÀ BIỆN PHÁP ĐỂ TỔ CHỨC, HƯỚNG DẪN THI HÀNH LUẬT THUẾ THU NHẬP DOANH NGHIỆP</p>' +
  '<p><em>Căn cứ </em><a id="tvpllink_oztzitmbya"></a><em>Luật Tổ chức Chính phủ số 63/2025/QH15;</em></p>';

/** 198_2025_QH15_657148.docx — NGHỊ QUYẾT (QH15 nhưng là nghị quyết) */
const HTML_NQ_198 =
  '<table><tr><td><p><strong>QUỐC HỘI<br />-------</strong></p></td>' +
  '<td><p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc <br />---------------</strong></p></td></tr>' +
  '<tr><td><p>Nghị quyết số: 198/2025/QH15</p></td><td><p><em>Hà Nội ngày 17 tháng 5 năm 2025</em></p></td></tr></table>' +
  '<p> </p><p><a id="loai_1"></a><strong>NGHỊ QUYẾT</strong></p>' +
  '<p><a id="loai_1_name"></a>VỀ MỘT SỐ CƠ CHẾ, CHÍNH SÁCH ĐẶC BIỆT PHÁT TRIỂN KINH TẾ TƯ NHÂN</p>' +
  '<p><strong>QUỐC HỘI</strong></p><p><em>Căn cứ </em><a id="tvpllink_khhhnejlqt"></a><em>Hiến pháp nước Cộng hòa xã hội chủ nghĩa Việt Nam;</em></p>';

/** 152_2025_TT-BTC_680351.docx — THÔNG TƯ */
const HTML_TT_152 =
  '<table><tr><td><p><strong>BỘ TÀI CHÍNH<br />-------</strong></p></td>' +
  '<td><p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc<br />---------------</strong></p></td></tr>' +
  '<tr><td><p>Số: 152/2025/TT-BTC</p></td><td><p><em>Hà Nội, ngày 31 tháng 12 năm 2025</em></p></td></tr></table>' +
  '<p> </p><p><a id="loai_1"></a><strong>THÔNG TƯ</strong></p>' +
  '<p><a id="loai_1_name"></a>HƯỚNG DẪN KẾ TOÁN CHO CÁC HỘ KINH DOANH, CÁ NHÂN KINH DOANH</p>' +
  '<p><em>Căn cứ </em><a id="tvpllink_lwmozzitmu"></a><em>Luật Kế toán số 88/2015/QH13 ngày 20 tháng 11 năm 2015;</em></p>';

/** 67_VBHN-VPQH_671127.docx — VBHN: loai_1 = LUẬT, số hiệu VBHN */
const HTML_VBHN_67 =
  '<table><tr><td><p><strong>VĂN PHÒNG QUỐC HỘI<br />--------</strong></p></td>' +
  '<td><p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc <br />---------------</strong></p></td></tr>' +
  '<tr><td><p>Số: 67/VBHN-VPQH</p></td><td><p><em>Hà Nội, ngày 15 tháng 8 năm 2025</em></p></td></tr></table>' +
  '<p><strong> </strong></p><p><a id="loai_1"></a><strong>LUẬT</strong></p>' +
  '<p><a id="loai_1_name"></a><strong>DOANH NGHIỆP</strong></p>' +
  '<p>Luật Doanh nghiệp số 59/2020/QH14 ngày 17 tháng 6 năm 2020 của Quốc hội</p>';

/** 91_2015_QH13_296215.docx — BỘ LUẬT (Dân sự) */
const HTML_BOLUAT_91 =
  '<table><tr><td><p><strong>QUỐC HỘI<br />--------</strong></p></td>' +
  '<td><p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc <br />---------------</strong></p></td></tr>' +
  '<tr><td><p>Luật số: 91/2015/QH13</p></td><td><p><em>Hà Nội, ngày 24 tháng 11 năm 2015</em></p></td></tr></table>' +
  '<p> </p><p><a id="loai_1"></a><strong>BỘ LUẬT</strong></p>' +
  '<p><a id="loai_1_name"></a><strong>DÂN SỰ</strong></p>' +
  '<p><em>Căn cứ </em><a id="tvpllink_khhhnejlqt"></a><em>Hiến pháp nước Cộng hòa xã hội chủ nghĩa Việt Nam; </em></p>';

// =========================================================================
// extractLegalTitleFromHtml
// =========================================================================

test('extractLegalTitleFromHtml — LUẬT 109: title chuẩn "Luật Thuế thu nhập cá nhân 109/2025/QH15"', () => {
  const r = lib.extractLegalTitleFromHtml(HTML_LUAT_109, '109_2025_QH15_665870.docx');
  assert.equal(r.doc_type, 'luat');
  assert.equal(r.doc_number, '109/2025/QH15');
  assert.equal(r.title, 'Luật Thuế thu nhập cá nhân 109/2025/QH15');
});

test('extractLegalTitleFromHtml — NGHỊ ĐỊNH 141: giữ NĐ-CP viết hoa, số hiệu từ bảng tiêu đề', () => {
  const r = lib.extractLegalTitleFromHtml(HTML_ND_141, '141_2026_ND-CP_703882.docx');
  assert.equal(r.doc_type, 'nd');
  assert.equal(r.doc_number, '141/2026/NĐ-CP');
  assert.ok(r.title.startsWith('Nghị định Sửa đổi, bổ sung một số điều'));
  assert.ok(r.title.includes('của nghị định số 68/2026/NĐ-CP'), 'giữ nguyên NĐ-CP');
  assert.ok(r.title.endsWith('141/2026/NĐ-CP'));
});

test('extractLegalTitleFromHtml — NGHỊ QUYẾT 198: QH15 nhưng doc_type = nq (từ nội dung)', () => {
  const r = lib.extractLegalTitleFromHtml(HTML_NQ_198, '198_2025_QH15_657148.docx');
  assert.equal(r.doc_type, 'nq');
  assert.equal(r.doc_number, '198/2025/QH15');
  assert.ok(r.title.startsWith('Nghị quyết Về một số cơ chế'));
});

test('extractLegalTitleFromHtml — THÔNG TƯ 152', () => {
  const r = lib.extractLegalTitleFromHtml(HTML_TT_152, '152_2025_TT-BTC_680351.docx');
  assert.equal(r.doc_type, 'tt');
  assert.equal(r.doc_number, '152/2025/TT-BTC');
  assert.ok(r.title.startsWith('Thông tư Hướng dẫn kế toán cho các hộ kinh doanh'));
  assert.ok(r.title.includes('cá nhân kinh doanh 152/2025/TT-BTC'));
});

test('extractLegalTitleFromHtml — VBHN 67: doc_type từ tên file (vbhn), title từ loai_1', () => {
  const r = lib.extractLegalTitleFromHtml(HTML_VBHN_67, '67_VBHN-VPQH_671127.docx');
  assert.equal(r.doc_type, 'vbhn');
  assert.equal(r.doc_number, '67/VBHN-VPQH');
  assert.equal(r.title, 'Luật Doanh nghiệp 67/VBHN-VPQH');
});

test('extractLegalTitleFromHtml — BỘ LUẬT 91 (Dân sự)', () => {
  const r = lib.extractLegalTitleFromHtml(HTML_BOLUAT_91, '91_2015_QH13_296215.docx');
  assert.equal(r.doc_type, 'luat');
  assert.equal(r.doc_number, '91/2015/QH13');
  assert.equal(r.title, 'Bộ luật Dân sự 91/2015/QH13');
});

test('extractLegalTitleFromHtml — không có loai_1 → fallback theo tên file', () => {
  const html = '<p>Chỉ có văn bản trần, không có anchor loai_1</p><table><tr><td>abc</td></tr></table>';
  const r = lib.extractLegalTitleFromHtml(html, '200_2026_ND-CP_999999.docx');
  assert.equal(r.doc_type, 'nd');
  assert.equal(r.doc_number, '200/2026/ND-CP');
  assert.ok(r.title.includes('200/2026/ND-CP'));
});

test('extractLegalTitleFromHtml — html rỗng → dùng tên file, không throw', () => {
  const r = lib.extractLegalTitleFromHtml('', 'Thong-tu-77-2026-TT-BTC.docx');
  assert.equal(r.doc_type, 'tt');
  assert.equal(r.doc_number, '77/2026/TT-BTC');
});

// =========================================================================
// extractDocTypeFromFileName
// =========================================================================

test('extractDocTypeFromFileName — theo agency trong tên file', () => {
  assert.equal(lib.extractDocTypeFromFileName('109_2025_QH15_665870.docx'), 'luat');
  assert.equal(lib.extractDocTypeFromFileName('141_2026_ND-CP_703882.docx'), 'nd');
  assert.equal(lib.extractDocTypeFromFileName('152_2025_TT-BTC_680351.docx'), 'tt');
  assert.equal(lib.extractDocTypeFromFileName('67_VBHN-VPQH_671127.docx'), 'vbhn');
  assert.equal(lib.extractDocTypeFromFileName('Thông-tư-91-2026-TT-BTC.docx'), 'tt');
});

test('extractDocTypeFromFileName — không nhận diện được → other', () => {
  assert.equal(lib.extractDocTypeFromFileName('so-tay-noi-bo.docx'), 'other');
  assert.equal(lib.extractDocTypeFromFileName(''), 'other');
});

// =========================================================================
// buildLegalDocRow + mapLegalDocRow (upsert payload public)
// =========================================================================

test('buildLegalDocRow — ghép payload upsert đủ cột', () => {
  const row = lib.buildLegalDocRow({
    html: '<p>LUẬT</p>',
    title: 'Luật Thuế thu nhập cá nhân 109/2025/QH15',
    doc_type: 'luat',
    doc_number: '109/2025/QH15',
    fileName: '109_2025_QH15_665870.docx',
    fileUrl: '',
  });
  assert.equal(row.title, 'Luật Thuế thu nhập cá nhân 109/2025/QH15');
  assert.equal(row.doc_type, 'luat');
  assert.equal(row.doc_number, '109/2025/QH15');
  assert.equal(row.file_html, '<p>LUẬT</p>');
  assert.equal(row.file_name, '109_2025_QH15_665870.docx');
  assert.equal(row.file_url, '');
  assert.equal(row.is_active, true);
});

test('mapLegalDocRow — shape public cho frontend', () => {
  const row = lib.mapLegalDocRow({
    id: 'abc-123',
    title: 'Luật Thuế TNCN 109/2025/QH15',
    doc_type: 'luat',
    doc_number: '109/2025/QH15',
    file_name: '109.docx',
    file_url: '',
    created_at: '2026-08-08T00:00:00Z',
  });
  assert.equal(row.id, 'abc-123');
  assert.equal(row.doc_type, 'luat');
  assert.equal(row.file_name, '109.docx');
  assert.equal(row.created_at, '2026-08-08T00:00:00Z');
});

// =========================================================================
// fetchLegalDocs / fetchLegalDocContent / upsertLegalDoc (mock Supabase)
// =========================================================================

/** Mock Supabase ghi log query vào calls[]. maybeSingle → data là 1 row (không phải array). */
function mockSbForLegalDocs(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const sb = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, val: unknown) => { calls.push(`eq:${col}=${val}`); return q; };
      q.order = (col: string, opts: unknown) => { calls.push(`order:${col}:${JSON.stringify(opts)}`); return q; };
      q.limit = (n: number) => { calls.push(`limit:${n}`); return q; };
      q.maybeSingle = () => { q._single = true; return q; };
      q.upsert = () => q;
      q.delete = () => q;
      q.then = (onFulfilled: (v: unknown) => unknown) => {
        const data = q._single ? (rows[0] ?? null) : rows;
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      };
      return q;
    },
  };
  return { sb, calls };
}

test('fetchLegalDocs — query landing_legal_docs is_active + map public shape', async () => {
  const { sb, calls } = mockSbForLegalDocs([
    { id: 'd1', title: 'Luật Thuế TNCN 109/2025/QH15', doc_type: 'luat', doc_number: '109/2025/QH15', file_name: '109.docx', file_url: '', created_at: '2026-08-08T00:00:00Z' },
  ]);
  const docs = await lib.fetchLegalDocs(sb);
  assert.ok(calls.some((c) => c === 'from:landing_legal_docs'));
  assert.ok(calls.some((c) => c === 'eq:is_active=true'));
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Luật Thuế TNCN 109/2025/QH15');
  assert.equal(docs[0].doc_type, 'luat');
  assert.equal(docs[0].doc_number, '109/2025/QH15');
});

test('fetchLegalDocs — bảng chưa tồn tại → trả [], không throw', async () => {
  const sb = {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'relation landing_legal_docs does not exist' } }).then(onFulfilled);
      return q;
    },
  };
  const docs = await lib.fetchLegalDocs(sb);
  assert.deepEqual(docs, []);
});

test('fetchLegalDocContent — trả title + file_html theo id', async () => {
  const { sb } = mockSbForLegalDocs([
    { title: 'Luật Doanh nghiệp 67/VBHN-VPQH', file_html: '<p>LUẬT</p><table><tr><td>Bảng</td></tr></table>' },
  ]);
  const r = await lib.fetchLegalDocContent(sb, 'd1');
  assert.equal(r.error, null);
  assert.equal(r.title, 'Luật Doanh nghiệp 67/VBHN-VPQH');
  assert.ok(r.file_html.includes('<table>'), 'giữ bảng biểu');
});

test('fetchLegalDocContent — thiếu id → error, không throw', async () => {
  const { sb } = mockSbForLegalDocs([]);
  const r = await lib.fetchLegalDocContent(sb, '');
  assert.equal(r.error, 'Thiếu id');
  assert.equal(r.file_html, '');
});

test('upsertLegalDoc — upsert onConflict file_name, không throw khi lỗi', async () => {
  const { sb, calls } = mockSbForLegalDocs([]);
  const res = await lib.upsertLegalDoc(sb, {
    title: 'X', doc_type: 'luat', doc_number: '', file_html: '<p>x</p>',
    file_name: 'x.docx', file_url: '', is_active: true,
  });
  assert.equal(res.ok, true);
  assert.ok(calls.some((c) => c === 'from:landing_legal_docs'));
});
