# -*- coding: utf-8 -*-
"""Fix ngay loat cac cuom goi nham trong draft dich-vu-thue-ke-toan-tada."""
import io

P = "tools/blog-content/cluster7-dich-vu/dich-vu-thue-ke-toan-tada.md"
t = io.open(P, encoding="utf-8").read()

pairs = [
    ('title: "Dịch vụ thuế kế toán TADA trọn gói giúp điều gì?"', 'title: "Dịch vụ thuế kế toán TADA trọn gói giúp được điều gì?"'),
    ('và均是 đầu vào', 'và là đầu vào'),
    ('không混合 vào nhau', 'không lẫn vào nhau'),
    ('nhóm chợ sổ gồm lập báo cáo tài chính, kiểm toán, handle lỗi sổ sách cũ', 'nhóm sổ sách gồm lập báo cáo tài chính, kiểm toán, xử lý lỗi sổ sách cũ'),
    ('trạm nộp thuế và định mức', 'nộp thuế thay và đối chiếu số'),
    ('mức phí màn từng vụ', 'mức phí từng vụ'),
    ('miễn giảm dò。', 'miễn giảm dần.'),
    ('hai cái không lai cai 语言 nhau', 'hai cái không lệch nhau'),
    ('Quản nghiệm đặt cách tính này', 'Lý do đặt cách tính này'),
    ('tình trạng hiện giữa nhiều lựa chọn', 'tình trạng hiện tại'),
]
n = 0
for old, new in pairs:
    if old in t:
        t = t.replace(old, new)
        n += 1
    else:
        print("KHONG TIM THAY:", old[:40])
io.open(P, "w", encoding="utf-8", newline="\n").write(t)
print("replaced:", n, "/", len(pairs))
