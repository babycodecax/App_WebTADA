# -*- coding: utf-8 -*-
import io, re

P = "tools/blog-content/cluster7-dich-vu/dich-vu-thue-ke-toan-tada.md"
t = io.open(P, encoding="utf-8").read()
ms = list(re.finditer('[\u3000-\u9fff\uff00-\uffef\u0400-\u04ff\ufffd]', t))
print("garbage con lai:", len(ms))
m = re.search('title: "([^"]+)"', t)
print("title:", len(m.group(1)), "kt |", m.group(1))
