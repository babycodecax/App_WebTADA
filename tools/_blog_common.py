# -*- coding: utf-8 -*-
"""Dung chung cho preflight-post.py va publish-post.py (chi stdlib, khong phu thuoc thu muc chay).

Secret khong bao gio in ra log: redact theo nhan (key=..., Bearer ..., "key":"...")
va theo gia tri (SECRETS nap tu .env).
"""
import http.client
import datetime
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
SITE = "https://ketoanthuetada.com"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

SECRETS = set()


def out(*parts):
    print(*parts, flush=True)


def remember_secrets(env):
    """Nap gia tri secret (ten co KEY/TOKEN/SECRET/PASSWORD, do dai >= 16) de redact theo gia tri."""
    for k, v in env.items():
        if re.search(r"KEY|TOKEN|SECRET|PASSWORD", k, re.I) and len(v) >= 16:
            SECRETS.add(v)


def redact(text):
    """Che secret theo nhan nhung (key=..., Bearer ..., "key":"...") va theo gia tri da biet."""
    t = str(text or "")
    t = re.sub(r"(?i)([A-Za-z0-9_\-]*(?:key|token|password|secret)[A-Za-z0-9_\-]*)\s*[:=]\s*"
               r"(\"[^\"]*\"|'[^']*'|[^\s\"',}]+)", r"\1=***", t)
    t = re.sub(r'(?i)"([A-Za-z0-9_\-]*(?:key|token|password|secret)[A-Za-z0-9_\-]*)"\s*:\s*"[^"]*"',
               r'"\1":"***"', t)
    t = re.sub(r"(?i)Bearer\s+[A-Za-z0-9\-_.~+/=]+", "Bearer ***", t)
    for s in SECRETS:
        if len(s) >= 16:
            t = t.replace(s, "***")
    return t


def read_env(path=None):
    """Doc .env (utf-8-sig de loai BOM). Tra dict; nap SECRETS luon."""
    if path is None:
        path = os.path.join(PROJECT_DIR, "api", ".env")
    env = {}
    try:
        text = io.open(path, "r", encoding="utf-8-sig").read()
    except OSError:
        return env
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    remember_secrets(env)
    return env


def frontmatter(text):
    """Tra (fm, body). fm = phan giua 2 lan '---' dau file (khong co backslash-newline)."""
    text = text.lstrip("\ufeff").lstrip()
    if not text.startswith("---"):
        return "", text
    lines = text.splitlines()
    if lines[0].strip() != "---":
        return "", text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[1:i]), "\n".join(lines[i + 1:])
    return "", text


def field(fm, name):
    """Lay truong frontmatter. Quoted greedy (chap nguoc kep trong chuoi), roi unquoted."""
    if not fm:
        return ""
    m = re.search(r"^%s:\s*\"(.*)\"\s*$" % re.escape(name), fm, re.M)
    if m:
        return m.group(1).strip()
    m = re.search(r"^%s:\s*([^\n]+?)\s*$" % re.escape(name), fm, re.M)
    return m.group(1).strip() if m else ""


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def http_json(method, url, headers=None, body=None, timeout=60):
    """Request HTTP; moi loi (timeout/wire/HTTP/JSON) -> RuntimeError voi thong bao da redact."""
    data = None
    h = dict(headers or {})
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in h.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            pass
        raise RuntimeError(redact("%s %s -> HTTP %s: %s" % (method, url, e.code, detail)))
    except urllib.error.URLError as e:
        raise RuntimeError(redact("%s %s -> LOI KET NOI: %s" % (method, url, e.reason)))
    except (socket.timeout, TimeoutError, ConnectionError, http.client.HTTPException) as e:
        raise RuntimeError(redact("%s %s -> TIMEOUT/WIRE: %s" % (method, url, e)))
    except OSError as e:
        raise RuntimeError(redact("%s %s -> LOI OS: %s" % (method, url, e)))
    if not raw:
        return None, status
    try:
        return json.loads(raw.decode("utf-8", "replace")), status
    except ValueError as e:
        raise RuntimeError(redact("%s %s -> khong phai JSON (%s)" % (method, url, e)))


def supabase(env):
    base = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_KEY") or ""
    if not base or not key:
        raise RuntimeError("thieu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong api/.env")
    if not base.endswith("/rest/v1"):
        base += "/rest/v1"
    return base, {"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"}


def get_row(env, table, slug):
    """Row moi nhat theo slug (limit 1 + order created_at desc de khong phu thuoc thu tu)."""
    base, h = supabase(env)
    url = (base + "/" + table + "?slug=eq." + urllib.parse.quote(slug, safe="")
           + "&select=*&limit=1&order=created_at.desc")
    rows, _ = http_json("GET", url, h)
    return rows[0] if rows else None


def knowledge_chunks_exist(env, file_path):
    base, h = supabase(env)
    url = base + "/knowledge_chunks?file_path=eq." + urllib.parse.quote(file_path, safe="") + "&select=id&limit=1"
    rows, _ = http_json("GET", url, h)
    return len(rows) > 0


def insert_row(env, table, body):
    base, h = supabase(env)
    rows, _ = http_json("POST", base + "/" + table,
                        dict(h, **{"Prefer": "return=representation"}), body)
    if not rows:
        raise RuntimeError("INSERT %s tra ve rong" % table)
    return rows[0]


def patch_row(env, table, row_id, body):
    """PATCH theo id (khong theo slug, de tranh cap nhat nhieu row trung slug)."""
    base, h = supabase(env)
    url = base + "/" + table + "?id=eq." + urllib.parse.quote(str(row_id), safe="")
    rows, _ = http_json("PATCH", url, dict(h, **{"Prefer": "return=representation"}), body)
    if not rows:
        raise RuntimeError("PATCH %s id=%s tra ve rong (khong row nao anh huong)" % (table, row_id))
    return rows[0]


def indexnow_key():
    path = os.path.join(TOOLS_DIR, ".indexnow-key.txt")
    try:
        t = io.open(path, "r", encoding="utf-8-sig").read().strip()
    except OSError:
        raise RuntimeError("khong tim thay tools/.indexnow-key.txt")
    if not t:
        raise RuntimeError("tools/.indexnow-key.txt rong")
    return t


def key_location():
    key = indexnow_key()
    pub = os.path.join(PROJECT_DIR, "api", "public", "indexnow-" + key + ".txt")
    if not os.path.exists(pub):
        raise RuntimeError("thieu api/public/indexnow-<key>.txt (deploy chua co key on site)")
    return SITE + "/indexnow-" + key + ".txt"


def indexnow_submit(env=None, slug=None, urls=None):
    """Gui IndexNow cho /blog/<slug> (hoac danh sach path dai). Tra HTTP status."""
    if slug:
        path = "/blog/" + slug
    elif urls:
        path = urls[0]
    else:
        raise RuntimeError("indexnow_submit: can slug hoac urls")
    key = indexnow_key()
    body = {
        "host": "ketoanthuetada.com",
        "key": key,
        "keyLocation": key_location(),
        "urlList": [SITE + path],
    }
    _, st = http_json("POST", "https://api.indexnow.org/indexnow", {}, body, timeout=60)
    return st


def bing_submit(slug):
    """Bing Webmaster qua tools/bing-submit.py. Tra (returncode, output_da_redact)."""
    cmd = [sys.executable, os.path.join(TOOLS_DIR, "bing-submit.py"), "--url", "/blog/" + slug]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=120)
    except (subprocess.TimeoutExpired, OSError) as e:
        raise RuntimeError("bing-submit khong chay duoc: " + redact(str(e)))
    combined = (p.stdout or "") + (p.stderr or "")
    return p.returncode, redact(combined).strip()


def write_atomic(path, data):
    """Ghi bytes noun atomically (tmp + os.replace). Truoc do luu .bak-<timestamp> theo bytes goc.

    Tra ve duong .bak da tao ('' neu file khong ton tai truoc).
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = ""
    if os.path.exists(path):
        with open(path, "rb") as f:
            raw = f.read()
        bak = path + ".bak-" + ts
        with open(bak, "wb") as b:
            b.write(raw)
    tmp = path + ".tmp-" + ts
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.replace(tmp, path)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise RuntimeError("khong ghi duoc %s (%s). Du lieu ban dau con nguyen; backup da tao o %s"
                           % (path, redact(str(e)), bak or "(khong co file cu)"))
    return bak


def published_at_iso(fm=""):
    """published_at tu frontmatter (neu co va khac null). Khong co -> None (server se dung 'now').

    Gia tri khong dung ISO-8601 (vi du '29/12/2026', 'dau thang 5') -> None; caller canh bao:
    dd/mm bi Postgres dien giai lom ngay MCY thanh 02/01 nen khoc day vao DB lai la ngay sai.
    """
    v = field(fm, "published_at") if fm else ""
    if not v or v.lower() in ("null", "none", "na"):
        return None
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    try:
        datetime.datetime.fromisoformat(v)
    except ValueError:
        return None
    return v
