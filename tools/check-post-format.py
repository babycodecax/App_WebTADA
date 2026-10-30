# -*- coding: utf-8 -*-
"""check-post-format.py — kiểm tra chuẩn bài blog TADA theo _CHUAN-BAI-BLOG-TADA.md
Usage: python tools/check-post-format.py <draft.md>
Exit 0 = PASS, exit 1 = FAIL (in danh sách lỗi).
"""
import io, re, sys, os

def fail(msgs, m):
    msgs.append(m)

def main():
    if len(sys.argv) < 2:
        sys.stdout.buffer.write(b"usage: python tools/check-post-format.py <draft.md>\n")
        return 1
    path = sys.argv[1]
    try:
        s = io.open(path, encoding="utf-8-sig", errors="strict").read()
    except UnicodeDecodeError as e:
        sys.stdout.buffer.write(("fail: %s\nERROR: file khong decode duoc UTF-8 (%s)\n" % (os.path.basename(path), e)).encode("utf-8"))
        return 1
    msgs = []

    fm = re.match(r"^---\n(.+?)\n---\n", s, flags=re.S)
    def field(name):
        m = re.search(name + r': "(.+)"', fm.group(1)) if fm else None
        return m.group(1) if m else ""
    title, summary, slug = field("title"), field("summary"), field("slug")
    if not (50 <= len(title) <= 60):
        fail(msgs, "title len=%d (can 50-60)" % len(title))
    if not (150 <= len(summary) <= 160):
        fail(msgs, "summary len=%d (can 150-160)" % len(summary))
    if not slug:
        fail(msgs, "thieu slug")

    body = re.sub(r"^---\n(.+?)\n---\n", "", s, count=1, flags=re.S)
    words = [w for w in re.sub(r"[#*>\-]+", " ", body).split() if re.search(r"[A-Za-z0-9]", w)]
    if not (1100 <= len(words) <= 1800):
        fail(msgs, "so tu=%d (can 1100-1800)" % len(words))

    if chr(0xFFFD) in s:
        fail(msgs, "co ky tu U+FFFD (mojibake)")
    for ch in s:
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF or 0x3040 <= o <= 0x30FF or 0xAC00 <= o <= 0xD7AF:
            fail(msgs, "co ky tu CJK/hangul %r" % ch)
            break

    i = s.rfind("## Xem thêm")
    faq_start = s.find("## Câu hỏi thường gặp")
    faq_end = i if i > 0 else len(s)
    faq_scope = s[faq_start:faq_end] if faq_start >= 0 else ""
    byline = "*Bài viết được thực hiện bởi Đội ngũ Chuyên gia Thuế TADA.*"
    byline_pos = s.rfind(byline)

    if faq_start < 0:
        fail(msgs, "thieu ## Câu hỏi thường gặp")
    elif not re.search(r"\*\*Câu \d", faq_scope):
        fail(msgs, "FAQ khong co cau hoi in dam **Câu n**")
    else:
        nq = len(re.findall(r"\*\*Câu \d", faq_scope))
        if not (3 <= nq <= 5):
            fail(msgs, "FAQ=%d cau (can 3-5, khong dem lan FAQ khac trong bai)" % nq)

    bq_pos = s.find("**Căn cứ pháp lý:**")
    if bq_pos < 0:
        fail(msgs, "thieu blockquote **Căn cứ pháp lý:**")
    elif s.count("https://www.google.com/search?q=") < 3:
        fail(msgs, "blockquote thieu link google.com/search (>=3)")

    if byline_pos < 0:
        fail(msgs, "thieu byline chuan")
    if "Dịch Vụ Thuế Kế Toán TADA. Cập nhật:" in s:
        fail(msgs, "byline sai kiểu (Dịch Vụ Thuế Kế Toán TADA. Cập nhật)")
    if re.search(r"^\*Xem thêm:.*\|", s, flags=re.M):
        fail(msgs, "dati dong italic*Xem thêm: a | b | c* (cấm — dùng section H2)")

    if i < 0:
        fail(msgs, "thieu ## Xem thêm")
    else:
        tail = s[i:]
        links = re.findall(r"\[[^\]]+\]\(https://ketoanthuetada\.com/blog/([a-z0-9-]+)\)", tail)
        if len(set(links)) < 5:
            fail(msgs, "Xem thêm co %d link post (can >=5, dung link tuyet doi)" % len(set(links)))
        if bq_pos >= 0 and not (i < bq_pos < byline_pos if byline_pos >= 0 else i < bq_pos):
            fail(msgs, "thu tu sai: Xem thêm phai truoc blockquote, va blockquote phai truoc byline")

    if not re.search(r"Cập nhật: \d{2}/\d{4} \| Nguồn", s):
        fail(msgs, "thieu dong *Cập nhật: MM/YYYY | Nguồn...*")
    if "Văn bản pháp lý xem mục Căn cứ pháp lý phía trên." not in s:
        fail(msgs, "dong Nguồn con liệt kê trùng văn bản (cần chốt: xem mục Căn cứ pháp lý phía trên)")

    out = "PASS %s\n" % os.path.basename(path) if not msgs else "FAIL (%d):\n%s\n" % (
        len(msgs), "\n".join("- " + m for m in msgs))
    sys.stdout.buffer.write(out.encode("utf-8"))
    return 0 if not msgs else 1

if __name__ == "__main__":
    sys.exit(main())
