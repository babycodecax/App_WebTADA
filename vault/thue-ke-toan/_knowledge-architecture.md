---
title: Kiến trúc Kho Kiến thức Thuế/Kế toán TADA
domain: tax
tags:
  - tax
  - architecture
  - meta
status: active
updated: 2026-09-07
---

# 🏗️ Kiến trúc Kho Kiến thức TADA

## Mục tiêu
Xây dựng kho kiến thức **duy nhất** làm nguồn tham khảo cho:
1. Chatbot TADA trả lời câu hỏi
2. Viết bài blog SEO
3. Hướng dẫn kê khai thuế

## Nguyên tắc

### 1. Single Source of Truth
- Mỗi chủ đề chỉ có **1 file chính** (pillar note)
- Các file phụ (detail notes) link về pillar
- Không duplicate nội dung

### 2. Version Control
- Mỗi file có `effective_date` và `expiry_date` (nếu có)
- Flag `status: current | expired | pending`
- Khi luật mới ra → update pillar, mark file cũ là expired

### 3. Cross-Reference
- Dùng `[[wikilink]]` để link giữa các note
- Mỗi pillar note có "Related notes" section
- Internal linking giúp chatbot tìm đúng thông tin

### 4. Verification Trail
- Mọi claim PHẢI có nguồn (tên văn bản + số hiệu + ngày ban hành)
- Cross-check 2+ nguồn khi có thể
- Ghi chú nếu thông tin chưa được xác minh

## Cấu trúc thư mục

```
vault/thue-ke-toan/
├── _index.md                    ← Master index
├── _knowledge-architecture.md   ← File này
├── _cheatsheet-thue-2026.md     ← Tổng hợp ngưỡng 2026
│
├── luat/                        ← Luật (Luật gốc)
│   ├── luat-48-2024-gtgt.md
│   ├── luat-67-2025-tndn.md
│   ├── luat-109-2025-tncn.md
│   ├── luat-66-2025-ttdb.md
│   ├── luat-108-2025-quan-ly-thue.md
│   └── ...
│
├── nghi-dinh/                   ← Nghị định (hướng dẫn luật)
│   ├── nd-141-2026-ho-kinh-doanh.md
│   ├── nd-253-2026-tncn.md
│   ├── nd-254-2026-hoa-don-dien-tu.md
│   └── ...
│
├── thong-tu/                    ← Thông tư (chi tiết)
│   ├── tt-152-2025-ke-toan-hkd.md
│   ├── tt-87-2026-tncn.md
│   ├── tt-91-2026.md
│   └── ...
│
├── huong-dan/                   ← Hướng dẫn thực hành
│   ├── cach-ke-khai-thue-hkd.md
│   ├── cach-tinh-thue-tncn.md
│   ├── hoa-don-dien-tu.md
│   └── ...
│
├── tinh-huong/                  ← Tình huống thực tế
│   ├── hk-duoi-500-trieu.md
│   ├── quyet-toan-thue-tncn.md
│   └── ...
│
└── nguon/                       ← Nguồn từ Google Drive
    └── (tài liệu đã ingest)
```

## Quy trình_ingest tài liệu mới

### Bước 1: Phân loại
- Law (Luật) → `luat/`
- Decree (Nghị định) → `nghi-dinh/`
- Circular (Thông tư) → `thong-tu/`
- Guide (Hướng dẫn) → `huong-dan/`
- Case (Tình huống) → `tinh-huong/`

### Bước 2: Verify hiệu lực
- Kiểm tra ngày ban hành
- Kiểm tra có văn bản thay thế chưa
- Ghi chú `status: current | expired`

### Bước 3: Extract knowledge
- Tóm tắt nội dung chính
- Trích xuất các con số quan trọng (ngưỡng, thuế suất, thời hạn)
- Ghi nguồn cụ thể

### Bước 4: Cross-link
- Link về pillar note liên quan
- Thêm vào `_index.md`
- Cập nhật cheatsheet nếu là ngưỡng mới

## Status markers

```yaml
status: current      ← Đang hiệu lực
status: expired      ← Đã hết hiệu lực (giữ lại để tham khảo)
status: pending      ← Chờ xác minh
status: draft        ← Đang viết dở
```

## Impact: Khi viết bài blog

1. Query vault theo chủ đề
2. Đọc pillar note + detail notes
3. Verify thông tin qua nguồn (.gov, Luật, Thông tư)
4. Viết bài với E-E-A-T signals
5. Cite nguồn cụ thể trong bài

## Impact: Khi chatbot trả lời

1. User hỏi → BM25 search vault
2. Tìm notes liên quan nhất
3. Trả lời dựa trên vault content (không bịa)
4. Cite nguồn: "Theo Điều X Luật Y..."
