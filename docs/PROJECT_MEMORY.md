# PROJECT_MEMORY — AI Second Brain

> Bộ nhớ dự án. Cập nhật mỗi phiên làm việc. Ngôn ngữ: tiếng Việt.

## 1. Quyết định cốt lõi (2026-07-15)
Xây bộ não riêng cho AI theo hướng **Local Workspace (Obsidian + obsidian-skills)**,
không dùng giải pháp cloud-only. Giữ Claude Code làm nơi vận hành; NotebookLM là công cụ riêng, không cấp nguồn cho vault.

Lý do: người dùng không rành kỹ thuật, cần sở hữu & kiểm soát dữ liệu,
muốn inspectable (mở Obsidian là thấy).

**Phạm vi:** dự án NGHIÊN CỨU xây khung bộ não AI **ĐA LĨNH VỰC**, dùng chung về sau
(không gắn riêng với dự án AIketoanthue). Chỉ kết hợp với AIketoanthue (hay dự án khác)
khi thực sự cần. Vault chứa tri thức của nhiều chủ đề, phân tách bằng tags/namespace.

## 2. Phân tích 2 repo nghiên cứu
- **awesome-second-brain**: khung quyết định, KHÔNG phải tool. Chia vòng đời thành 5 giai đoạn
  (Collect, Organize, Evolve, Use, Govern) và so sánh ~24 giải pháp theo các giai đoạn đó.
- **obsidian-skills** (kepano): bộ skills thực tế cho Claude Code/Codex/OpenCode thao tác Obsidian
  vault (markdown, bases, json-canvas, cli, defuddle lọc web). Là lớp "cơ khí" để AI vận hành vault.
- **Điểm giao nhau**: giải pháp `obsidian-wiki` (local, MIT, skills-based) trong awesome-second-brain
  là fit nhất cho "bộ não inspectable, cross-agent". `obsidian-skills` chính là lớp kỹ thuật giúp
  Claude Code vận hành được vault đó. → Hai repo bổ trợ thành một phương án hoàn chỉnh.

## 3. Khung lifecycle 5 giai đoạn (áp dụng cho dự án)
| Giai đoạn | Việc cần làm |
|---|---|
| Collect | Gom tài liệu thuế, quyết định dự án, lịch sử chat vào vault |
| Organize | Gắn frontmatter (tags, nguồn), [[wikilink]] liên kết, viết index |
| Evolve | Định kỳ lint / gộp trùng / thêm mới (bảo Claude chạy, không tự nền) |
| Use | Claude đọc vault trước khi trả lời → context sát thực tế |
| Govern | Mở Obsidian sửa/xóa/kiểm tra nguồn gốc bằng mắt |

## 4. So sánh các giải pháp (tóm tắt theo lớp)
- **End-to-End Apps**: Membase (nhanh, cloud), OpenHuman (beta), Khoj (search), Hjarni (Markdown hosted).
  → Tiện nhưng phụ thuộc vendor, trái với "bộ não riêng".
- **Local Workspaces** (đáng cân nhắc nhất):
  obsidian-wiki ✅, Obsidian/Logseq+AI bridge ✅ (= obsidian-skills), GBrain (mạnh nhưng nặng),
  Hermes+LLM Wiki / Hermes+Obsidian+Honcho (phức tạp), Pad (tốt cho team).
- **Agent Memory Layers**: Mem0, Honcho, Hindsight, Mnemosyne, Supermemory, Hyperspell, taOSmd, Vestige.
  → Thiên dev/agent builder, cần code hoặc tự chạy LLM. KHÔNG phù hợp người không rành kỹ thuật.
- **Memory Substrates**: Zep/Graphiti, Cognee. → Hạ tầng đồ thị, cần app phía trên.
- **Platform Baselines**: NotebookLM ✅ (đang dùng), Claude Code/Projects ✅ (đang dùng),
  ChatGPT Memory (khoá platform).

## 5. Công thức tối ưu cho người dùng
Local Workspace (Obsidian + skills) làm chủ; Claude Code làm nơi vận hành. NotebookLM là công cụ nghiên cứu riêng, không feed vault.
Không chạm 3 lớp còn lại (Agent Memory / Substrate / End-to-End cloud).

## 6. Bước tiếp theo (TODO)
- [x] Tạo vault tại `ai-second-brain/vault/` (đã có từ init dự án)
- [ ] **Cài Obsidian** (BẠN làm: tải obsidian.md → Open folder as vault → chọn `ai-second-brain/vault/`)
- [x] Thêm obsidian-skills vào `.claude` của vault (5 skills: defuddle, json-canvas, obsidian-bases, obsidian-cli, obsidian-markdown)
- [x] Viết 3 mẫu note đầu: `decision-local-workspace.md` (#project), `project-ai-second-brain.md` (#project),
  `legal/glossary.md` (#legal, khung mẫu). Thêm sub-brain `legal/` (_index, _template, glossary).
- [ ] Chạy thử 1 vòng Collect→Organize với tài liệu thuế thực tế (CHỜ người dùng cung cấp tài liệu gốc)

## 7. Nguồn
- awesome-second-brain: solutions/, comparisons/capability-matrix.md, comparisons/solution-layers.md
- obsidian-skills: skills/obsidian-markdown, README.md

## 8. Sub-brain Thuế & Kế toán (khởi tạo 2026-07-15)
Bộ não con đầu tiên, nằm trong `vault/thue-ke-toan/`. Đúng kịch bản "kết hợp khi cần" —
dự án AIketoanthue chưa gắn trực tiếp, chỉ tách biệt bằng namespace `#tax`.

**Cấu trúc:**
```
vault/thue-ke-toan/
├── _index.md      # MOC: bản đồ chủ đề + nguyên tắc
├── _template.md   # Mẫu note chuẩn (frontmatter + cấu trúc)
└── glossary.md    # Khung thuật ngữ (GTGT, TNDN, TNCN, HĐĐT, BCTC…)
```

**Quy ước:** `domain: tax` + tag `#tax/<chủ-đề>`; mọi note gắn `source`; liên kết bằng `[[wikilink]]`.

**Nguồn kiến thức (QUY TẮC cứng):** CHỈ từ tài liệu người dùng tự thêm vào vault.
Không dùng NotebookLM, không tự suy luận/bịa. Claude chỉ trích xuất & cấu trúc từ tài liệu gốc,
ghi rõ `source` cho mỗi note. (Lưu ý 2026-07-15: người dùng xác nhận rõ điều này.)

**TODO:** thu thập note thực tế (GTGT/TNDN/TNCN, chế độ kế toán) TỪ TÀI LIỆU NGƯỜI DÙNG CUNG CẤP.

## 9. Các sub-brain khác (tương lai)
Mỗi lĩnh vực mới → 1 thư mục `vault/<ten>/` + namespace tag riêng. Giữ nguyên khung 5 giai đoạn.

## 10. Nhật ký phiên làm việc — 2026-07-15
Arc của phiên (phục vụ phiên sau):
1. Nghiên cứu 2 repo (`awesome-second-brain`, `obsidian-skills`) → so sánh ~24 giải pháp theo khung 5 giai đoạn.
2. Chốt hướng **Local Workspace (Obsidian + obsidian-skills)**, Claude Code vận hành.
3. Tạo dự án `D:\CodeApp\Projects\ai-second-brain` (README, CLAUDE.md, memory, vault).
4. Làm rõ **phạm vi đa lĩnh vực** (không gắn riêng AIketoanthue; chỉ kết hợp khi cần).
5. Tạo **sub-brain Thuế & Kế toán** (`vault/thue-ke-toan/`: _index, _template, glossary).
6. Khóa **QUY TẮC NGUỒN**: kiến thức CHỈ từ tài liệu người dùng tự thêm — KHÔNG NotebookLM, KHÔNG tự suy luận. Đã rà soát & sửa mọi file liên quan.
7. Thống nhất **quy trình thêm tài liệu** (xem §11).

**Trạng thái cuối phiên:** cấu trúc dự án + sub-brain sẵn sàng. CHƯA cài Obsidian, CHƯA thêm skills,
CHƯA có note thực tế. `glossary.md` đang là khung tạm (Claude gõ) — chờ người dùng thay bằng tài liệu gốc.

## 11. Quy trình thêm tài liệu (dành phiên sau)
Người dùng không rành kỹ thuật → ưu tiên Cách 1.
1. **Chat với Claude (dễ nhất)**: dán nội dung / cho đường dẫn file (`D:\...\file.pdf`) / thả file vào chat.
   Claude tạo note theo `_template.md`, gắn `#tax`, ghi `source`.
2. **Bỏ file thô vào thư mục**: copy file gốc vào `vault/thue-ke-toan/sources/` → bảo "xử lý file trong sources/".
3. **Tự gõ trong Obsidian**: khi đã cài, mở vault tạo note thủ công.

> Quy tắc khi thêm: chỉ trích xuất từ tài liệu gốc, ghi rõ `source`, KHÔNG tự bịa/thêm kiến thức.
> Tài liệu hỗ trợ: PDF, Word, txt, ảnh chụp văn bản (nếu là chữ).

## 12. Nhật ký phiên làm việc — 2026-07-16
Arc của phiên (thực hiện tuần tự TODO §6):
1. Khảo sát: Obsidian **chưa cài** (giao người dùng); obsidian-skills đã có local tại `D:\CodeApp\Projects\obsidian-skills`.
2. **Bước 2 — Thêm skills**: copy `skills/` → `vault/.claude/skills/` (5 skills: defuddle, json-canvas,
   obsidian-bases, obsidian-cli, obsidian-markdown). Theo README obsidian-skills: để `.claude` ở gốc vault.
3. **Bước 3 — 3 mẫu note + sub-brain đa lĩnh vực**:
   - `decision-local-workspace.md` (#project/decision): ghi lại quyết định chọn Local Workspace.
   - `project-ai-second-brain.md` (#project/overview): tổng quan dự án, map các sub-brain.
   - Tạo sub-brain `legal/` (_index, _template, glossary) làm ví dụ khung đa lĩnh vực.
   - `legal/glossary.md` là KHUNG CỘT MẪU, chưa có nội dung thật (tuân quy tắc không bịa kiến thức).
4. Cập nhật PROJECT_MEMORY.md §6 (đánh dấu xong bước 2, 3; giữ bước cài Obsidian & vòng Collect thực tế).

**Trạng thái cuối phiên:** vault có khung đa lĩnh vực sẵn sàng (#tax, #legal, #project). CHỜ: (a) người dùng cài Obsidian,
(b) người dùng cung cấp tài liệu gốc (thuế/pháp lý) để điền note thực tế & chạy vòng Collect→Organize.

## 13. Nhật ký phiên làm việc — 2026-07-16 (tiếp)
1. Người dùng đã cài Obsidian và mở vault. Lỗi: mở nhầm `vault/AI/` (Obsidian tạo `vault/AI/.obsidian`).
   → Hướng dẫn đổi vault về `vault/` (gốc). Sau đó `vault/.obsidian/` tạo đúng.
2. Người dùng báo "thấy đúng thư mục nhưng không thấy skill".
   → LÀM RÕ: 5 skills là **Agent Skills dành cho Claude Code**, KHÔNG hiện trong giao diện Obsidian
   (không có ở thanh bên / `Ctrl+P`). Chúng đã active cho Claude từ đầu phiên.
   Obsidian chỉ là nơi lưu & xem note; Claude Code mới là bên "vận hành" skills.
3. Xoá thư mục nhầm `vault/AI/` (chỉ chứa Welcome.md mặc định).

**Kết luận:** Setup hoàn tất & ĐÚNG. Không cần cấu hình thêm trong Obsidian.
Cách dùng: người dùng chỉ việc nhắn yêu cầu (vd "tạo note thuế GTGT"), Claude tự gọi obsidian-markdown/defuddle…
**Bước tiếp theo:** cung cấp tài liệu gốc (PDF/Word/text) → chạy vòng Collect→Organize (bước 4).

## 14. Quyết định nguồn NotebookLM — 2026-07-16 (tiếp)
- Người dùng hỏi: có lấy toàn bộ sổ tay NotebookLM (thuế/kế toán) xuống nạp vault không?
- **Quyết định:** KHÔNG lấy từ NotebookLM (vi phạm quy tắc nguồn cứng §1,§5,§8).
  NotebookLM là tóm tắt AI → không phải văn bản gốc, không kiểm chứng được, dễ bịa lệch.
- **Lối đi đúng (người dùng chọn):** Xuất các **file gốc** đã up vào NotebookLM → `vault/thue-ke-toan/sources/`
  → Claude trích xuất thành note chuẩn gắn `#tax` + `source`.
- Đã tạo `vault/thue-ke-toan/sources/` + `sources/README.md` hướng dẫn.
- Lưu ý: dự án này KHÔNG "train" mô hình — vault là kho tri thức local để Claude đọc khi trả lời.

**Trạng thái:** chờ người dùng xuất file gốc từ NotebookLM vào `sources/` → chạy bước 4.

## 15. Thử nghiệm export NotebookLM — 2026-07-16
- Đã login `nlm login` thành công. `notebook_list` → 12 sổ tay; sổ tay thuế chính:
  `Sổ tay về Thuế TNCN/TNDN/GTGT/HKD 2026` (44 nguồn, id d4922f14…).
- Thử `source_get_content` 2 nguồn:
  - PDF `144-2026-nd-cp.pdf` → TRẢ VỀ **link ảnh** (PDF scan, không có text). KHÔNG dùng được.
  - DOCX `Luật thuế TNCN 109_2025_QH15.docx` → TRẢ VỀ **toàn văn text sạch** (~30k ký tự). Dùng được.
- **Kết luận quan trọng:** Trong 44 nguồn, phần lớn là `.pdf` scan → API chỉ cho link ảnh, không tự động xuất chữ.
  Chỉ vài file `.docx` lấy được text.
- Đã tạo note mẫu `thue-ke-toan/luat-thue-tncn-2025.md` từ DOCX (quy trình Collect→Organize chạy OK),
  cập nhật `thue-ke-toan/_index.md`.
- **Vấn đề cần giải quyết cho PDF scan:** cần file gốc để OCR (API không lấy được chữ). Hướng: người dùng
  tải file gốc PDF từ NotebookLM (Download) vào `sources/`, rồi OCR本地 (cần tool) HOẶC tạo note title-only
  chờ bổ sung. Chưa quyết → hỏi người dùng.

**Trạng thái:** 1 note TNCN đã làm từ DOCX. CHỜ: quyết định cách xử lý ~42 PDF scan.

## 16. Quyết định bổ sung tài liệu — 2026-07-16
- Người dùng chọn: **tự bổ sung thủ công file Word gốc** vào `sources/`, thay vì export từ NotebookLM.
- Lý do: PDF trong NotebookLM là bản scan (API không lấy chữ); file Word gốc do người dùng có → đúng quy tắc
  (tài liệu gốc do người dùng thêm), không tốn context export.
- Quy trình: người dùng copy file `.docx`/`.pdf` thật vào `vault/thue-ke-toan/sources/` → nhắn
  "xử lý file trong sources/" → Claude đọc → tạo note chuẩn theo `_template.md`.
- Lưu ý: file PDF scan vẫn cần OCR本地 mới lấy chữ được; ưu tiên file Word.

**Trạng thái:** chờ người dùng bỏ file Word gốc vào `sources/` → chạy bước 4.

## 17. Xử lý file 89 nặng 208MB — 2026-07-16
- `89_2026_TT-BTC_714011.docx` = 208MB. Phân tích: `word/embeddings/oleObject1.bin` = 205MB
  (magic `D0CF11E0` = OLE Compound File — đối tượng nhúng, KHÔNG phải ảnh). Text thật chỉ 2,6MB.
- Người dùng xác nhận đã lưu bản gốc ở thư mục khác → cho xóa bản gốc trong dự án.
- Xử lý: tạo bản **lean** (loại bỏ `oleObject1.bin`) → file còn **170KB** (giảm 99,9%),
  giữ nguyên 555.745 ký tự text. Xóa bản gốc 208MB. `sources/` tổng còn 3,4MB.
- **Bài học:** trước khi trích xuất, luôn check dung lượng docx; OLE embed có thể phình file.
  Công cụ trích text: python parse `word/document.xml` (regex `<w:t>`), không cần pandoc.

**Trạng thái:** 41 file .docx sẵn sàng trong `sources/`, dung lượng nhẹ. Sẵn sàng chạy bước 4 (trích xuất → note).

## 18. Bước 4 — Lô 1 (docx→note) — 2026-07-16
- Người dùng chọn phương án **lô 5–8 file, duyệt dần** (không làm liền 41 file).
- Công cụ: script `.tmp_extract/extract_docx.py` (parse `word/document.xml`, ghi UTF-8 từng file ra thư mục để tránh lỗi charset Windows + tràn context). Lưu ý: KHÔNG in text ra console (charmap lỗi tiếng Việt) — luôn ghi ra file .txt rồi Read.
- **Lô 1 xong: 6 note** trong `vault/thue-ke-toan/` (chỉ trích xuất từ file gốc, gắn `#tax` + source + `[[wikilink]]`):
  1. `nd-144-2026-gtgt.md` ← 144/2026/NĐ-CP (sửa đổi NĐ 181/2025 Luật GTGT; hiệu lực 20/06/2026).
  2. `tt-32-2026-tai-san-ma-hoa.md` ← 32/2026/TT-BTC (thuế crypto: GTGT không chịu, TNDN 20%, TNCN 0,1%).
  3. `tt-50-2026-ho-kinh-doanh.md` ← 50/2026/TT-BTC (sửa đổi TT 18/2026 QLT hộ KD/CNKD).
  4. `vbhn-luat-thue-xnk-107-2016.md` ← 96/VBHN-VPQH (Luật Thuế XK/NK hợp nhất).
  5. `nd-253-2026-tncn.md` ← 253/2026/NĐ-CP (hướng dẫn Luật TNCN 109/2025, 60+ điều).
  6. (note mẫu cũ `luat-thue-tncn-2025.md` đã link chéo).
- Cập nhật `_index.md`: thêm hàng bản đồ TNCN/GTGT/XNK/tài sản mã hóa/hộ kinh doanh, `updated: 2026-07-16`.
- **Bài học lô 1:** file phụ lục dài (bảng mã HS, biểu thuế) chỉ ghi chú tóm tắt, KHÔNG copy toàn văn (tiết kiệm context + note gọn để tra cứu).

**Trạng thái:** 6/41 file xong (lô 1). **Còn 35 file** cho các lô sau. Lô 2 đề xuất tiếp 6 file: 360, 149, 41, 91, 67(VBHN), 108. Task list: #1 done, #2 (35 file còn lại) + #3 (cập nhật index/memory) đang mở.

## 19. Bước 4 — Lô 2 (docx→note) — 2026-07-17
- **Lô 2 xong: 6 note** trong `vault/thue-ke-toan/` (chỉ trích xuất từ file gốc, gắn `#tax` + source + `[[wikilink]]`):
  1. `nd-360-2025-ttdb.md` ← 360/2025/NĐ-CP (chi tiết Luật Thuế TTĐB 66/2025; hiệu lực 01/01/2026).
  2. `luat-149-2025-gtgt.md` ← 149/2025/QH15 (sửa đổi Luật GTGT: miễn nông sản chưa chế biến, hộ doanh thu ≤500tr; hiệu lực 01/01/2026).
  3. `luat-41-2024-bhxh.md` ← 41/2024/QH15 (Luật BHXH: hệ thống đa tầng, bắt buộc/tự nguyện/hưu trí bổ sung).
  4. `bo-luat-dan-su-2015.md` ← 91/2015/QH13 (Bộ luật Dân sự 2015: 6 phần, 27 chương, nguyên tắc cơ bản).
  5. `vbhn-luat-doanh-nghiep-2025.md` ← 67/VBHN-VPQH (hợp nhất Luật DN 59/2020 + sửa đổi 03/2022, 76/2025).
  6. `luat-108-2025-quan-ly-thue.md` ← 108/2025/QH15 (Luật Quản lý thuế mới: phân nhóm NNT, nguyên tắc bản chất, cưỡng chế).
- **Ghi chú:** 3 file 41/91/67 (BHXH, Dân sự, DN) không phải chuyên môn thuế → gắn thêm tag `#legal`, để trong `thue-ke-toan/` làm tài liệu hỗ trợ tra cứu (theo namespace `tax/legal`).
- Cập nhật `_index.md`: thêm hàng TTĐB, Quản lý thuế, Pháp lý liên quan; `updated: 2026-07-17`.
- File temp trích xuất: `.tmp_extract/lot2/` (6 file .txt).

**Trạng thái:** 12/41 file xong (lô 1+2). **Còn 29 file** cho các lô 3–7. Lô 3 đề xuất tiếp 6 file: 09, 48, 66, 67(2025), 109, 174.

## 20. Bước 4 — Lô 3 (docx→note) — 2026-07-17
- **Lô 3 xong: 6 note** trong `vault/thue-ke-toan/` (chỉ trích xuất từ file gốc, gắn `#tax` + source + `[[wikilink]]`):
  1. `luat-09-2026-sua-doi-4-luat-thue.md` ← 09/2026/QH16 (sửa đổi TNCN/GTGT/TNDN/TTĐB: mức doanh thu do CP quy định; thuế suất xe điện).
  2. `luat-48-2024-gtgt.md` ← 48/2024/QH15 (Luật GTGT gốc: 0%/5%/10%, khấu trừ, hoàn thuế; hiệu lực 01/07/2025).
  3. `nd-174-2025-giam-thue-gtgt.md` ← 174/2025/NĐ-CP (giảm thuế GTGT: 10%→8%, 20% tỷ lệ %; 01/07/2025-31/12/2026).
  4. `luat-66-2025-ttdb.md` ← 66/2025/QH15 (Luật TTĐB gốc: lộ trình 2026-2031 thuốc lá/rượu/bia/ô tô; hiệu lực 01/01/2026).
  5. `luat-67-2025-tndn.md` ← 67/2025/QH15 (Luật TNDN gốc: 20%, DN nhỏ 15%/17%, ưu đãi; hiệu lực 01/01/2026).
  6. `luat-109-2025-tncn.md` ← 109/2025/QH15 (Luật TNCN gốc: lũy tiến, giảm trừ 15,5tr, miễn/giảm; hiệu lực 01/07/2026).
- Lô 3 tập trung vào các **luật gốc** quan trọng (GTGT, TTĐB, TNDN, TNCN) + NĐ giảm thuế + Luật sửa đổi 4 luật thuế.
- Cập nhật `_index.md`: thêm hàng GTGT (gốc + NĐ giảm), TNDN, TNCN (gốc), TTĐB (gốc), Sửa đổi 4 luật thuế.
- File temp trích xuất: `.tmp_extract/lot3/` (6 file .txt).

**Trạng thái:** 18/41 file xong (lô 1+2+3). **Còn 23 file** cho các lô 4–7. Lô 4 đề xuất: 254, 252, 255, 141, 293, 310.

## 21. Bước 4 — Lô 4 + Lô 5 (docx→note) — 2026-07-17
> ⚠️ SESSION 2026-07-17 ghi "lô 4 dở (19/41)" là STALE. Thực tế trên đĩa: lô 4 ĐÃ XONG (6 note) + lô 5 ĐÃ XONG (6 note). Tổng 30 notes / 41 sources.

**Lô 4 xong (6 note):** nd-254 (HĐĐT 254/2026), nd-252 (NĐ hướng dẫn QLT 252/2026), nd-255 (NĐ giao dịch liên kết 255/2026), nd-141 (NĐ HKD + TNDN nhỏ 141/2026), nd-293 (NĐ lương tối thiểu 293/2025), nd-310 (NĐ xử phạt thuế/HĐ 310/2025). `_index.md` đã link đủ.

**Lô 5 xong (6 note):** (chủ đề HKD/QLT + TNDN chi tiết + KTTN + LĐ)
1. `nd-68-2026-ho-kinh-doanh.md` ← 68/2026/NĐ-CP (thuế & QLT HKD/CNKD: doanh thu ≤500tr miễn GTGT/TNCN; HĐĐT ≥01 tỷ; bỏ khoán).
2. `tt-18-2026-ho-kinh-doanh.md` ← 18/2026/TT-BTC (hồ sơ thủ tục QLT HKD/CNKD; thay thế TT 40/2021, 100/2021).
3. `nd-320-2025-tndn.md` ← 320/2025/NĐ-CP (chi tiết Luật TNDN 67/2025: 26 điều, thuế suất 20%, ưu đãi 10%/15 năm).
4. `tt-20-2026-tndn.md` ← 20/2026/TT-BTC (hướng dẫn TNDN: hồ sơ chi được trừ, ưu đãi, nhà thầu nước ngoài; thay thế TT 78/2014, 96/2015).
5. `nq-198-2025-kinh-te-tu-nhan.md` ← 198/2025/QH15 (cơ chế phát triển KTTN: bỏ lệ phí môn bài 2026, miễn/giảm TNDN DNNVV, thanh tra ≤1 lần/năm).
6. `nd-337-2025-hop-dong-lao-dong-dien-tu.md` ← 337/2025/NĐ-CP (HĐLĐ điện tử; Nền tảng Bộ Nội vụ vận hành 01/07/2026).

**Bài học lô 5:** file 181 (NĐ GTGT 224KB) và 320 (NĐ TNDN 240KB) quá nặng → KHÔNG đọc toàn văn; chỉ lấy tiêu đề điều khoản (grep) + văn bản hướng dẫn (TT 20) để viết note cô đọng. 181 để lô sau xử lý riêng.

**Trạng thái:** 36/41 notes xong (lô 1–5 + lô 6a). **Còn 6 sources** cho lô 6b: 89 (TT 89/2026 chi tiết QLT 108 + NĐ 252; 512KB rất nặng), 181 (NĐ GTGT gốc; 99KB), Thông-tư-91 (219KB), 94 (TT 94/2026; 39KB), 90 (TT 90/2026; 441KB rất nặng), 99 (TT 99/2025; 852KB rất nặng). Xử lý lô 6b = chỉ grep tiêu đề điều khoản (không đọc toàn văn file nặng).

**Lô 6a xong (2026-07-17):** thêm 6 notes — tt-152-2025-ke-toan-hkd (TT kế toán HKD/CNKD), tt-58-2026-ke-toan-dnsn (TT kế toán DNSN), tt-69-2025-gtgt (TT chi tiết GTGT + NĐ 181/2025), tt-87-2026-tncn (TT chi tiết TNCN 109/2025 + NĐ 253/2026), nd-359-2025-gtgt (NĐ sửa đổi NĐ 181/2025), nd-125-2020-xu-phat (NĐ cũ, status deprecated, bị NĐ 310/2025 thay thế). Đã cập nhật _index.md.

**Điều chỉnh số liệu (2026-07-17):** memory ghi "còn 11 sources" là STALE. Thực tế đĩa có 44 sources (30 đã có note + 14 chưa). Trong 14 đó: 91 (Bộ luật Dân sự) và 96 (VBHN Luật XNK) THỰC TẾ ĐÃ CÓ note từ lô 2 (ghi rõ source) → loại khỏi "chưa làm". Còn 12 sources chưa note; đã làm 6 (lô 6a), còn 6 (lô 6b).

## 23. Bước 4 — Lô 6b (docx→note) — 2026-07-18
- **Lô 6b = 6 file nặng:** 89 (TT 89/2026 — chi tiết QLT 108 + NĐ 252), 181 (NĐ 181/2025 — GTGT gốc), Thông-tư-91 (TT 91/2026), 94 (TT 94/2026), 90 (TT 90/2026), 99 (TT 99/2025 — Chế độ kế toán DN).
- **Thêm file 18/2026** (đã có note tổng quan từ lô 5 `tt-18-2026-ho-kinh-doanh.md` → user chọn **giữ bản tách theo Điều**, xóa note tổng quan lô 5).
- **Cách làm (theo user "như lô 6a" nhưng file nặng → tách Điều):** mỗi văn bản → 1 thư mục `vault/thue-ke-toan/chung/<doc_id>/` chứa N notes tách theo `^Điều (\d+)`, + 1 MOC note ở root `vault/thue-ke-toan/<doc_id>.md` list các Điều.
- **Script:** `process_docx.py` (parse `word/document.xml` XML trực tiếp — tránh lỗi zip của python-docx với file có OLE embed), slugify doc_id, tách Điều. `make_moc.py` sinh MOC. `fix_index_6b.py` sửa bảng index. (Các script tạm để ở gốc dự án, chưa dọn vào `.tmp_extract/`.)
- **Kết quả:** 177 notes (TT99=31, ND181=40, TT91=25, TT94=23, TT90=38, TT89=11, TT18=9) + 7 MOC notes.
- **Cập nhật `_index.md`:** thêm 6 hàng lô 6b (năm đúng 2025/2026), sửra link `[[tt-18-2026|...]]` (thay note tổng quan lô 5), `updated: 2026-07-18`.
- **Vấn đề đã sửra:** file `89_2026_TT-BTC_714011.docx` lỗi python-docx (thiếu `word/embeddings/oleObject1.bin`) → chuyển sang XML parser. Gõ nhầm năm 2025/2026 ở index → sửra bằng script.

**Trạng thái:** Lô 6b XONG. Tổng ~43/41 sources đã có note (file 18 xử lý riêng). `sources/` còn nguyên (giữ để user đối chiếu gốc). Còn dọn script tạm (tùy chọn).

## 24. Dọn dẹp + Evolve (lint link) — 2026-07-18
- **Dọn script tạm:** đã `mv` 3 script (`process_docx.py`, `make_moc.py`, `fix_index_6b.py`) từ gốc dự án vào `.tmp_extract/`. Gốc repo còn 3 script trích xuất cốt lõi (`extract_docx.py`, `extract_docx_xml.py`, `split_docx_to_notes.py`).
- **Evolve — lint wikilink toàn vault Thuế & Kế toán:** quét 548 wikilink hợp lệ.
  - Lưu ý: scanner đầu tiên báo giả 39 "link gãy" do regex sai (không loại dấu `\` trong cú pháp escape `\|` chuẩn Obsidian). Viết lại parser đúng → chỉ còn **4 link gãy thật** (đều typo trong note nội dung, KHÔNG phải `_index`).
  - Đã sửa 4 link: `nd-252-2026-huong-dan-ql-thue`→`nd-252-2026-huong-dan-qlthue` (nd-254); `nd-125-2020-xu-phat-thue-hoa-don`→`nd-125-2020-xu-phat` (nd-293, nd-310); `tt-18-2026-ho-kinh-doan`→`tt-18-2026` (tt-152).
  - Quét lại: **0 link gãy** / 548 wikilink.
- **Bài học:** khi lint wikilink Obsidian, parser phải bỏ phần alias sau `|` (kể cả `\|` escape) trước khi so target; nếu không sẽ báo giả hàng loạt.

**Trạng thái cuối phiên:** vault Thuế & Kế toán sạch link, gốc repo gọn. Dự án cơ bản hoàn tất — chờ user cung cấp tài liệu mới hoặc yêu cầu Evolve tiếp (gộp note trùng, cập nhật văn bản cũ).

## 25. Evolve lần 2 (governance + status) — 2026-07-18
- **Mục tiêu:** Evolve vault — sửa governance violation, chuẩn hóa status, cải thiện link.
- **Phát hiện & xử lý:**
  - `luat-thue-tncn-2025.md`: vi phạm Governance (nguồn ghi NotebookLM) → sửa nguồn trỏ `sources/109_2025_QH15_665870.docx`; sửa cả body "cung cấp qua NotebookLM" → "cung cấp". Đồng thời đổi `status: draft`→`active` (nội dung 76 dòng, hoàn chỉnh).
  - 6 note mang `status: draft` cũ nhưng nội dung đã hoàn chỉnh (nd-144, nd-253, tt-32, tt-50, vbhn-xnk, luat-tncn) → đổi hết thành `active`.
  - `nd-125-2020-xu-phat.md` (deprecated): thêm wikilink `[[nd-310-2025-xu-phat-thue-hoa-don]]` vào callout "Không áp dụng".
- **Kết quả kiểm tra:** quét lại 549 wikilink (vault-wide basename) → **0 link gãy** (duy nhất `[[wikilink]]` trong `_index.md` là văn bản ví dụ, không tính). Không còn reference NotebookLM trong note (chỉ `sources/README.md` meta). Không còn note draft ngoài `_template.md`.
- **Bài học:** Obsidian giải wikilink theo basename toàn vault (không chỉ cùng thư mục) — scanner phải so target với tất cả basename trong vault, không chỉ file cùng dir. Các link `[[nd-181-2025-dieu-N]]` trỏ đúng vào `chung/nd-181-2025/*.md`.

**Trạng thái cuối phiên:** vault sạch governance, status chuẩn, 0 link gãy. Sẵn sàng nhận tài liệu mới hoặc Evolve sâu hơn (gộp note trùng nếu có).

## 26. Sửa lỗi biểu thuế TNCN + bổ sung bảng (2026-07-18)
- **Phát hiện:** hỏi đáp TNCN (thu nhập 30tr/tháng, 1 NPT) → Claude tính sai do note `luat-109-2025-tncn.md` THIẾU bảng biểu thuế lũy tiến (chỉ ghi "Điều 9" không có ngưỡng). Claude vô tình dùng bậc cũ ≤60tr/năm.
- **User corrrect:** biểu MỚI (Luật 109/2025, từ kỳ tính thuế 2026): Bậc 1 ≤120tr/năm (5%); Bậc 2 120–360tr (10%). Với 61,8tr/năm → thuế = 3,09 triệu/năm.
- **Đã sửa vault:** thêm "Biểu thuế lũy tiến (Điều 9)" vào `luat-109-2025-tncn.md` (bậc 1–2 xác nhận; bậc 3+ đánh dấu ⚠️ CHƯA TRÍCH ĐỦ, cấm tự suy luận). Sửa ví dụ A (tính đúng 3,09tr). Cập nhật `updated: 2026-07-18`.
- **BÀI HỌC QUAN TRỌNG:** khi note ghi "theo Điều X" mà thiếu bảng/số liệu → coi là GAP, KHÔNG dùng kiến thức cũ thay thế. Luôn yêu cầu user bổ sung từ văn bản gốc.
- **CÒN THIẾU:** bậc 3+ biểu thuế TNCN (>360tr/năm) chưa có trong vault — cần trích từ NĐ 253/2026 Điều 46 khi có nguồn.

**Trạng thái:** vault đã có bậc 1–2 chuẩn; bậc 3+ chờ nguồn.

## 28. Cấp 1 — Tăng cường tri thức (2026-07-18)
> Theo hướng "tăng độ thông minh dự án" user đã duyệt (Cấp 1: tri thức). Cấp 2 (quy trình) & Cấp 3 (công cụ) CHƯA làm.

- **Tạo Cheatsheet Tổng hợp** `vault/thue-ke-toan/_cheatsheet-thue-2026.md` — **Single Source of Truth** các ngưỡng thuế 2026:
  GTGT (0/5/10%), TNDN (20/15/17% + chi được trừ: tiền mặt ≥5tr không trừ, quỹ R&D ≤10%...), TNCN (biểu 5 bậc + giảm trừ 15,5tr/6,2tr + các loại thu nhập), TTĐB 2026→2031 (bia 65%, rượu, vàng mã 70%...), XNK (C/O form D, KPTQ→nội địa), và bảng "ngưỡng chung dễ nhầm" (tiền mặt 5tr thay 20tr cũ, doanh thu miễn 1 tỷ/500tr, lương tối thiểu vùng, bỏ trần quảng cáo/ô tô). Mỗi mục link wikilink → note luat-* gốc.
- **Gắn link file .docx gốc** vào 9 note luật (phần Nguồn): luat-48, luat-67, luat-109, luat-66, luat-149, luat-108, luat-09, luat-41, vbhn-doanh-nghiep → dòng `File gốc (.docx): sources/<file>.docx`. (luat-thue-tncn-2025, vbhn-xnk-107 đã có sẵn từ trước.)
- **Cập nhật `_index.md`:** thêm dòng đầu bảng "📌 Tổng hợp ngưỡng 2026 → [[_cheatsheet-thue-2026]]".
- **CÔNG DỤNG:** user mở Obsidian thấy ngay bảng tổng hợp; mỗi note luật đều trace được file gốc .docx để đối chiếu → tăng độ tin cậy & tốc độ tra cứu.

**Trạng thái:** Cấp 1 HOÀN THÀNH. Dự án sạch, chính xác, tra cứu nhanh. Cấp 2/3 chờ user quyết định.

## 29. Hướng đi mới — Bỏ NotebookLM, hướng tích hợp Web (2026-07-18)
> User quyết định: **KHÔNG dùng check NotebookLM định kỳ** (→ bỏ Cấp 2 trong đề xuất cũ). Vault local vẫn là chuẩn, nhưng **mục tiêu tương lai: gắn bộ não (vault) này vào website cá nhân của user**.

- **Tác động tới Cấp 2/3 cũ:** đề xuất Cấp 2 (ghim rule check NotebookLM + lint định kỳ) → loại bỏ phần NotebookLM; chỉ giữ lại lint link định kỳ nếu cần. Cấp 3 (semantic search local) vẫn để sau.
- **Hướng Web (chưa làm):** vault Obsidian hiện là local, inspectable. Để lên web sau này cần: (a) chuẩn hóa xuất ra dạng web-readable (md/json-canvas đã có sẵn qua obsidian-skills); (b) lớp query/tìm kiếm trên web đọc vault. Chưa lập kế hoạch chi tiết — chờ user muốn bắt đầu.
- **Nguyên tắc giữ nguyên:** Local-first, inspectable, người dùng sở hữu. KHÔNG đẩy kiến thức lên cloud/vendor (NotebookLM chỉ là tạm thời, sẽ bỏ).

**Trạng thái:** xác nhận hướng. Vault hiện tại đã sẵn sàng làm nền tảng cho web sau này (md chuẩn, wikilink, cheatsheet tổng hợp). Chờ user chỉ định bước tiếp theo hoặc cung cấp web để tích hợp.

## 30. Check 100 câu Test1.docx — Chuẩn luật 2026 (2026-07-18)
> User yêu cầu check độ chính xác 100 câu trong `D:/CodeApp/Projects/awesome-second-brain/DataTest/Test1.docx` (bộ câu hộ KD/CNKD).
> **Quyết định:** User chọn **"Luật mới 2026"** → trả lời theo chuẩn vault 2026, bất chấp đề ghi năm 2024/2025 & ngưỡng 100tr.

- **Phát hiện quan trọng:** Bộ đề dùng **ngưỡng 100tr/năm** (miễn GTGT&TNCN HKD), **tỷ lệ khoán TT 40/2021** (GTGT 1%/3%, TNCN 0,5%/1%/2%/5%), năm **2024/2025**. → KHÔNG khớp với vault luật 2026 (NĐ 68/2026: mốc 500tr, bỏ khoán).
- **Căn cứ 2026:** nd-68-2026 (HKD: ≤500tr miễn GTGT&TNCN; >500tr tính trực tiếp theo tỷ lệ % do CP quy định), tt-50/tt-18, luat-48 (GTGT 10%), luat-109 (TNCN biểu lũy tiến).
- **Quy trình làm:** trích docx → text (.tmp_extract/Test1.txt, 19.352 ký tự, 102 dòng) → chia 10 lô × 10 câu → ghi `docs/qa-100-cau/qa-test1-01-10.md` ... → mỗi câu ghi "Chuẩn 2026" + "Đối chiếu đề (luật cũ)".
- **Tiến độ:** [x] Lô 1 (câu 1–10) → file `qa-test1-01-10.md`; [x] Lô 2 (câu 11–20) → file `qa-test1-11-20.md`. **Còn Lô 3–10 (câu 21–100).**
- **Kết luận sơ bộ Lô 1–2:** hầu hết câu đề dùng doanh thu ≤100–500tr + tỷ lệ khoán cũ → **theo chuẩn 2026 đều miễn thuế** (vì ≤500tr), khác với đáp án đề tính thuế. Các câu >500tr (17: 600tr, 18: 800tr) → chịu thuế, KHÔNG trừ tiền phạt/nguyên giá TSCĐ.

**Trạng thái:** 20/100 câu xong (lô 1–2). Context tăng → dừng, lưu memory, đề xuất `/clear-session` → `/clear` → `/resume-session` để tiếp lô 3–10 trong session mới (tránh cạn context giữa chừng).


- **Hướng user chọn:** NotebookLM = công cụ hỗ trợ TẠM THỜI để làm giàu/kiểm chứng cho **nguồn local** (vault vẫn là chuẩn cuối). Không đổi bản chất dự án (local-first, inspectable).
- **Quy trình đã thiết lập:** (1) hỏi NotebookLM câu khó; (2) cross-check với vault; (3) **nếu khớp văn bản gốc → user cho phép auto-cập nhật vault luôn, không hỏi lại** (quyết định 2026-07-18). Chỉ lấy phần trích luật, bỏ quảng cáo thương mại trong source notebook.
- **Auth:** `nlm login` (Chrome CDP). Lỗi rich-console sau khi xong nhưng token vẫn lưu → list lại được.
- **Notebook thuế liên quan:** `d4922f14` "Sổ tay Thuế TNCN/TNDN/GTGT/HKD 2026" (42 src, shared_with_me); `e5ad498e` "AI Kế toán Thuế - Quy tắc & Quy chế" (owned).
- **CẢNH BÁO:** notebook "Sổ tay Thuế" có source chứa footer quảng cáo tư vấn thuế (Zalo 0986...) → lọc bỏ khi đưa vào vault.
- **Áp dụng đầu tiên:** điền bậc 3–5 biểu thuế TNCN (>360tr: 20/30/35%) vào `luat-109-2025-tncn.md`, xác minh từ Điều 9 Luật 109/2025 qua NotebookLM. Vault giờ có biểu thuế ĐẦY ĐỦ 5 bậc.
