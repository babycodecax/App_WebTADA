# -*- coding: utf-8 -*-
"""Verify dot 1: REST (title/summary/published_at) + live HTML marker (chi co trong ban moi)."""
import io, json

exp_sum = {
    "dich-vu-ke-toan-tron-goi": "ghi sổ sách",
    "dich-vu-tu-van-thue-ke-toan-tong-hop": "hồ sơ thật",
    "dich-vu-dang-ky-hkd-hoa-don-dien-tu": "ngay từ đầu",
    "dich-vu-ke-khai-thue-tncn-gtgt": "chịu trách nhiệm.",
    "dich-vu-hoan-thue-tncn": "không rủi ro",
}
d = json.load(open("tools/temp/verify-dot1.json", encoding="utf-8"))
print("REST fetch:", len(d), "bai")
for x in sorted(d, key=lambda r: r["slug"]):
    s = x["summary"] or ""
    ok = exp_sum.get(x["slug"], "") in s
    print(x["slug"], "| title:", len(x["title"]), "| summary:", len(s), "| pub:", (x["published_at"] or "")[:10], "| marker:", "OK" if ok else "SAI")

exp_live = {
    "dich-vu-ke-toan-tron-goi": "phần giấy tờ thì TADA lo",
    "dich-vu-tu-van-thue-ke-toan-tong-hop": "gắn với hồ sơ thật của bạn",
    "dich-vu-dang-ky-hkd-hoa-don-dien-tu": "Hộ muốn tự làm từng khâu",
    "dich-vu-ke-khai-thue-tncn-gtgt": "cuối tháng đầu quý nếu quý",
    "dich-vu-hoan-thue-tncn": "Đừng quên nơi đã nghỉ giữa năm",
}
for s, mk in exp_live.items():
    h = io.open("tools/temp/live-%s.html" % s, encoding="utf-8", errors="replace").read()
    print("live", s, "| bytes:", len(h), "| marker ban moi:", "CO" if mk in h else "KHONG CO")
