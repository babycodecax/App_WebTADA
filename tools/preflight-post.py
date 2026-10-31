# -*- coding: utf-8 -*-
"""Preflight draft truoc khi publish: checker format + hop le co ban + rac token + link noi bo + ngay trong tuan.

Cach dung (khong phu thuoc thu muc chay):
  python tools/preflight-post.py <draft.md> [--fix-weekday] [--no-checker]

Kiem tra:
  1. chay tools/check-post-format.py (in output; FAIL -> ERR)
  2. slug/title/summary; slug regex + so khop ten file; do dai chi WARN
  3. rac token: CJK/Cyrillic/U+FFFD + mojibake letter?letter -> ERR; tu case rac (lower+UPPER trong token) -> WARN
  3b. ngan sach tu theo muc: intro > 160 / H2 > 320 / body > 1750 -> WARN (muc tieu viet <=1750 thay vi cat sau)
  4. link noi bo /blog/<slug> khong ton tai trong DB -> ERR
  5. ngay trong tuan: trong bang (xac dinh cot Ngay/Thu THEO HEADER) va trong cau chu
     (window 30 ky tu quanh ngay, ho tro 'la', 'roi vao', '29/12, thu Tu', '(thu Tu)',
     'thu Tu ngay 29/12'); SAI -> ERR; o bang co thu khong nhan dien -> WARN
--fix-weekday: chi sua cot Thu cua BANG (ten Thu Viet chuan, giu padding cot khac),
  ghi atomic + .bak-<timestamp>; ERR trong cau chu thi chinh tay.
Exit: 0 OK; 1 co ERR; 2 sai tham so (argparse).
"""
import argparse
import datetime
import io
import os
import re
import subprocess
import sys

from _blog_common import (SLUG_RE, TOOLS_DIR, field, frontmatter, http_json, out,
                          read_env, redact, strip_accents, supabase, write_atomic)

CHECKER = os.path.join(TOOLS_DIR, "check-post-format.py")

WD_MAP = {"hai": 0, "2": 0, "ba": 1, "3": 1, "tu": 2, "4": 2, "nam": 3, "5": 3,
          "sau": 4, "6": 4, "bay": 5, "7": 5, "nhat": 6, "chunhat": 6}
WD_VI = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

DATE_FULL = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b")
# Lu (?!\w) de "thu bay" khong bi match thanh "thu ba" (alternation uu tien nhahn trai)
WD_TOKEN = re.compile(r"thu\s*(?:2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)(?!\w)|chu\s*nhat(?!\w)|chunhat(?!\w)")
SEP_CELL = re.compile(r"^:?-{2,}:?$")
LINK_MD = re.compile(r"\]\((/blog/[A-Za-z0-9\-]+)(?:\s+\"[^\"]*\")?\)")
LINK_HREF = re.compile(r"href=\"/blog/([A-Za-z0-9\-]+)\"")

# Ngan sach tu theo muc (WARN, khong chan): tong the checker chan 1100-1800.
INTRO_BUDGET = 160   # phan sau H1 title truoc H2 dau tien
SEC_BUDGET = 320     # moi H2 (ke ca FAQ)
# Tu co lowercase -> UPPERCASE ngay trong token (dau hieu rac xay ro khi viet nhanh)
MIXCASE = re.compile(r"[a-zăâđêôơư][A-Z]")
GARBLE_OK = {"eTax", "iPhone", "iPad", "iOS", "PayPal", "ZaloPay", "ShopeePay",
             "MoMo", "PayOS"}


def _parse_day(s):
    """Chuoi o bang 'dd/mm/yyyy' hoac 'dd-mm-yyyy' hoac 'dd thang mm' -> (y|None, m, d); sai -> None."""
    t = strip_accents(s.lower()).strip("*_` ")
    t = t.replace("đ", "d")
    m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}))?", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
    else:
        m = re.fullmatch(r"(\d{1,2})\s*thang\s*(\d{1,2})(?:\s*nam\s*(\d{4}))?", t)
        if not m:
            return None
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
    if d > 31 or mo > 12:
        return None
    try:
        datetime.date(int(y) if y else 2000, mo, d)
    except ValueError:
        return None
    return (int(y) if y else None), mo, d


def _cell_tokens(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def _tables(lines):
    """Block cac dong lien tiep bat dau '|' (1 dong moi la 1 block); tra [(start_idx, [line, ...])]."""
    res = []
    i, n = 0, len(lines)
    while i < n:
        if lines[i].lstrip().startswith("|"):
            j = i
            while j < n and lines[j].lstrip().startswith("|"):
                j += 1
            res.append((i, lines[i:j]))
            i = j
        else:
            i += 1
    return res


def check_table_weekdays(lines, year):
    """Quet bang lai. Bang khong co header 'Ngay' + 'Thu' -> bo qua (khong doan blind)."""
    issues, warns = [], []
    for start, block in _tables(lines):
        if len(block) < 3:
            continue
        header = _cell_tokens(block[0])
        hnorm = [strip_accents(c.lower()).strip("*_ `").replace("đ", "d") for c in header]
        idx_date = next((k for k, v in enumerate(hnorm) if v == "ngay" or v.startswith("ngay ")), None)
        idx_wd = next((k for k, v in enumerate(hnorm)
                       if v == "thu" or v.startswith("thu trong tuan")), None)
        if idx_date is None or idx_wd is None:
            body_txt = strip_accents("\n".join(block).lower())
            if WD_TOKEN.search(body_txt):
                warns.append("bang dong %d: khong xac dinh cap cot Ngay/Thu trong header "
                             "(bo qua %d dong, tuy chinh tay)" % (start + 1, len(block)))
            continue
        has_sep = any(all(SEP_CELL.match(c) for c in _cell_tokens(l) if c)
                      for l in block[1:3])
        if not has_sep:
            continue  # khong co dong separator |---| -> khong phai bang markdown header -> bo qua
        for pos in range(start + 2, start + len(block)):
            line = lines[pos]
            cells = _cell_tokens(line)
            if len(cells) <= max(idx_date, idx_wd):
                continue
            ymd = _parse_day(cells[idx_date])
            if not ymd:
                continue
            y, mo, d = ymd
            y = y if y else year
            said_raw = cells[idx_wd].strip()
            said_norm = strip_accents(said_raw.lower()).replace("đ", "d").strip("*_ ")
            rem = re.sub(r"^(?:thu|chu)\s*", "", said_norm).strip()
            said = WD_MAP.get(rem)
            if said is None:
                warns.append("bang dong %d: khong nhan dien duoc thu trong o %r" % (pos + 1, said_raw))
                continue
            try:
                actual = datetime.date(y, mo, d).weekday()
            except ValueError:
                continue
            if said != actual:
                issues.append({
                    "line_no": pos + 1,
                    "col_wd": idx_wd,
                    "line": line,
                    "said": said,
                    "actual": actual,
                    "date_str": "%02d/%02d/%d" % (d, mo, y),
                })
    return issues, warns


def fix_table_weekdays(text, issues):
    """Sua cot Thu theo chi so dong + chi so cot (khong re dung theo chuoi).
    Chi chay tren dong bat buoc bat dau '|' (khong chiu indent) de tranh ghi de nham cot.
    """
    lines = text.split("\n")
    fixed = []
    skipped = []
    for it in issues:
        li = it["line_no"] - 1
        line = lines[li]
        if not line.lstrip().startswith("|"):
            skipped.append(it["line_no"])
            continue
        toks = re.split(r"(\|)", line)
        if line.startswith("|"):
            base = 2
        else:
            skipped.append(it["line_no"])
            continue
        idx = base + 2 * it["col_wd"]
        if idx >= len(toks):
            continue
        old = toks[idx]
        core = old.strip()
        if core:
            toks[idx] = old.replace(core, WD_VI[it["actual"]], 1)
        else:
            toks[idx] = " " + WD_VI[it["actual"]] + " "
        lines[li] = "".join(toks)
        fixed.append((it["line_no"], it["date_str"], WD_VI[it["actual"]]))
    for ln in skipped:
        out("(fix-weekday: bo qua dong %d — dong khong lai bang '|' thoang, sua tay)" % ln)
    return "\n".join(lines), fixed


def check_inline_weekdays(text, year):
    """Cau chu: lay toan bo ngay va toan bo token thu trong flat, ghép greedy-nearest:
    moi token chi bind 1 ngay (gianh cho ngay gan nhat), moi ngay bind 1 token.
    Bo qua: trong link, co ngay khac chen giua, ngan cach cau .;!? newline, 'theo thu tu'.
    """
    issues = []
    if not text or not year:
        return issues
    flat = strip_accents(text.lower()).replace("đ", "d")
    flat = re.sub(r"\b(\d{1,2})-(\d{1,2})-(\d{4})\b", r"\1/\2/\3", flat)
    flat = re.sub(r"\b(\d{1,2})\s*thang\s*(\d{1,2})\b", r"\1/\2", flat)
    # dd-mm (2 phan): khong thay neu ngay sau la '/' (de tranh chuyen thanh dd/mm/yyyy am)
    flat = re.sub(r"\b(\d{1,2})-(\d{1,2})\b(?!/)", r"\1/\2", flat)

    dates = []
    for m in DATE_FULL.finditer(flat):
        if "://" in flat[max(0, m.start() - 12): m.start()]:
            continue
        d, mo = int(m.group(1)), int(m.group(2))
        if d > 31 or mo > 12:
            continue
        ytxt = m.group(3)
        y = int(ytxt) if ytxt else year
        try:
            actual = datetime.date(y, mo, d).weekday()
        except ValueError:
            continue
        dates.append((m.start(), m.end(), d, mo, ytxt, y, actual))

    toks = []
    for tm in WD_TOKEN.finditer(flat):
        kw = tm.group(0).strip()
        mm = re.search(r"(hai|ba|tu|nam|sau|bay)$", kw)
        if mm:
            kw = mm.group(1)
        elif re.search(r"[2-7]$", kw):
            kw = kw[-1]
        elif "nhat" in kw.replace(" ", ""):
            kw = "chunhat"
        else:
            continue
        said = WD_MAP.get(kw)
        if said is None:
            continue
        toks.append((tm.start(), tm.end(), said, tm.group(0)))

    cands = []
    for ds_, de_, d, mo, ytxt, y, actual in dates:
        for ts, te, said, raw in toks:
            if de_ <= ts and ts - de_ <= 30:
                seg = flat[de_: ts]
                dist = ts - de_
            elif ts < ds_ and te <= ds_ and ds_ - te <= 30:
                seg = flat[te: ds_]
                dist = ds_ - te
            else:
                continue
            if re.search(r"[.;!?]|\n", seg):
                continue
            # ngay khac nam giua ky tu token va ngay duoc doan (CHON 2 CHIEU) -> bo cap nay
            if DATE_FULL.search(seg):
                continue
            parts = flat[max(0, ts - 6): ts].split()
            if parts and parts[-1] == "theo":
                continue
            cands.append((dist, ds_, de_, d, mo, ytxt, y, actual, ts, said))

    cands.sort(key=lambda c: (c[0], c[1]))
    used_date, used_tok = set(), set()
    keep = []
    for dist, ds_, de_, d, mo, ytxt, y, actual, ts, said in cands:
        if (ds_, de_) in used_date or ts in used_tok:
            continue
        used_date.add((ds_, de_))
        used_tok.add(ts)
        if said == actual:
            continue
        keep.append((ds_, d, mo, ytxt, y, actual, said))
    issues = []
    for ds_, d, mo, ytxt, y, actual, said in keep:
        line_no = flat.count("\n", 0, ds_) + 1
        issues.append("dong %d: '%02d/%02d%s' la %s nhung van ban ghi '%s' (nam %d)"
                      % (line_no, d, mo, ("/" + ytxt if ytxt else ""),
                         WD_VI[actual], WD_VI[said], y))
    loose = sum(1 for t in toks if t[0] not in used_tok)
    return issues, loose


def guess_year(text, fm):
    v = field(fm, "created_at") or field(fm, "date") or field(fm, "published_at") or ""
    ym = re.search(r"(20\d{2})", v)
    if ym:
        return int(ym.group(1))
    years = re.findall(r"\b(20\d{2})\b", text)
    if years:
        return int(max(set(years), key=years.count))
    return datetime.date.today().year


def check_word_budget(body):
    """WARN ngan sach: mo bai > INTRO_BUDGET, tung muc H2 > SEC_BUDGET."""
    warns = []
    parts = re.split(r"(?m)^(#{1,2} .*)$", body)
    heads = parts[1::2]
    sects = parts[2::2]
    for h, chunk in zip(heads, sects):
        wcount = len(chunk.split())
        if h.startswith("# "):
            if wcount > INTRO_BUDGET:
                warns.append("mo bai ~%d tu (ngan sach %d)" % (wcount, INTRO_BUDGET))
        elif wcount > SEC_BUDGET:
            warns.append("'%s' ~%d tu (ngan sach %d)" % (h[3:].strip()[:60], wcount, SEC_BUDGET))
    return warns


def check_garble_words(text, limit=5):
    """WARN token rac co case bat thuong (vd 'tungOMISTRY'): lowercase + UPPERCASE trong 1 tu.
    Bo qua dong chua link, token trong GARBLE_OK."""
    res = []
    for i, line in enumerate(text.split("\n"), 1):
        if "http" in line.lower():
            continue
        for tok in re.findall(r"[A-Za-zăâđêôơưÀ-ỹ]{2,}", line):
            if tok in GARBLE_OK or not MIXCASE.search(tok):
                continue
            res.append((i, tok))
            break
        if len(res) >= limit:
            break
    return res


def load_db_slugs(env):
    base, h = supabase(env)
    url = base + "/blog_posts?select=slug&limit=5000"
    rows, _ = http_json("GET", url, h)
    return set(r["slug"] for r in rows)


def collect_slugs(text):
    res = set(LINK_MD.findall(text))
    for mm in LINK_HREF.finditer(text):
        res.add(mm.group(1))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("draft")
    ap.add_argument("--fix-weekday", action="store_true",
                    help="sua cot Thu trong bang (backup .bak-<ts>)")
    ap.add_argument("--no-checker", action="store_true")
    args = ap.parse_args()

    # Chay qua pipe (publish-post.py goi subprocess capture_output): console mac dinh
    # cp1252 -> in token Viet dung %r/%s nut UnicodeEncodeError -> rc=1 gai nhiem FAIL.
    # Reconfigure khop pattern extract_docx.py:34.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

    path = args.draft
    if not os.path.isfile(path):
        out("FAIL: khong tim thay draft %s" % path)
        return 2

    with io.open(path, "r", encoding="utf-8-sig", newline="") as f:
        text = f.read()
    fm, body = frontmatter(text)

    errs, warns = [], []

    # 1) checker format
    if not args.no_checker:
        if not os.path.exists(CHECKER):
            errs.append("thieu tools/check-post-format.py de kiem tra format")
        else:
            try:
                p = subprocess.run([sys.executable, CHECKER, path], capture_output=True,
                                   text=True, encoding="utf-8", errors="replace", timeout=180)
                print((p.stdout or "") + (p.stderr or ""), end="")
                if p.returncode != 0:
                    errs.append("check-post-format FAIL (rc=%d, xem chi tiet o tren)" % p.returncode)
            except (subprocess.TimeoutExpired, OSError) as e:
                errs.append("check-post-format khong chay duoc: %s" % redact(str(e)))

    # 2) frontmatter / do dai
    slug = field(fm, "slug").strip()
    title = field(fm, "title").strip()
    summary = field(fm, "summary").strip()
    stem = os.path.splitext(os.path.basename(path))[0]
    if not slug:
        errs.append("thieu slug trong frontmatter")
    elif not SLUG_RE.fullmatch(slug):
        errs.append("slug khong hop le (a-z0-9 va dau gach): %r" % slug)
    elif slug != stem:
        errs.append("slug (%s) khac ten file (%s) - co the copy nham draft" % (slug, stem))
    if not title:
        errs.append("thieu title")
    elif not 50 <= len(title) <= 60:
        warns.append("title %d ky tu (checker khuyen 50-60)" % len(title))
    if not summary:
        errs.append("thieu summary")
    elif not 150 <= len(summary) <= 160:
        warns.append("summary %d ky tu (khuyen 150-160)" % len(summary))
    body_est = re.sub(r"<figure[\s\S]*?</figure>", " ", re.sub(r"https?://\S+", " ", body))
    wc = len(re.findall(r"[A-Za-z0-9À-ỹ]+", body_est))
    if wc and (wc < 1100 or wc > 1750):
        warns.append("body ~%d tu (checker chan 1100-1800)" % wc)
    warns.extend(check_word_budget(body))

    # 3) rac token
    cjk = sum(1 for c in text if (0x4E00 <= ord(c) <= 0x9FFF or 0x3040 <= ord(c) <= 0x30FF
                                  or 0xAC00 <= ord(c) <= 0xD7AF or 0x0400 <= ord(c) <= 0x04FF
                                  or ord(c) == 0xFFFD))
    if cjk:
        errs.append("co %d ky tu rac (CJK/Cyrillic/U+FFFD)" % cjk)
    hit = re.findall(r"\w\?\w", re.sub(r"https?://\S+", " ", text))
    if hit:
        errs.append("mojibake letter?letter (vi du %r) - kiem tra lai encoding file" % hit[:3])
    garble = check_garble_words(text)
    if garble:
        warns.append("tu co case rac (sua tay): "
                     + ", ".join("%r (dong %d)" % (t, ln) for ln, t in garble))

    # 4) link noi bo
    env = read_env()
    db_slugs = None
    if env:
        try:
            db_slugs = load_db_slugs(env)
        except RuntimeError as e:
            warns.append("khong kiem tra link DB: %s" % e)
    else:
        warns.append("khong kiem tra link DB (api/.env trong/khong ton tai)")
    if db_slugs is not None:
        for s in sorted(collect_slugs(text)):
            if s not in db_slugs:
                errs.append("link chet /blog/%s" % s)

    # 5) ngay trong tuan
    year = guess_year(text, fm)
    lines = text.split("\n")
    t_issues, t_warns = check_table_weekdays(lines, year)
    warns.extend(t_warns)
    if args.fix_weekday:
        if not fm:
            errs.append("--fix-weekday can frontmatter, draft khong co; khong ghi file")
        else:
            new_text, fixed = fix_table_weekdays(text, t_issues)
            if fixed:
                try:
                    bak = write_atomic(path, new_text.encode("utf-8"))
                    for ln, ds, nm in fixed:
                        out("DA SUA weekday: dong %d (%s) -> %s" % (ln, ds, nm))
                    out("da ghi: %s (backup %s) - chay lai preflight de xac nhan" % (path, bak))
                    text = new_text
                    lines = text.split("\n")
                    t_issues, t_warns = check_table_weekdays(lines, year)
                    warns.extend(t_warns)
                except RuntimeError as e:
                    errs.append(str(e))
            else:
                out("(fix-weekday: khong co o bang nao can sua)")
    for it in t_issues:
        errs.append("bang dong %d: ghi %s nhung %s la %s"
                    % (it["line_no"], WD_VI[it["said"]], it["date_str"], WD_VI[it["actual"]]))
    imsgs, loose = check_inline_weekdays(text, year)
    for msg in imsgs:
        errs.append(msg)
    if loose:
        warns.append("%d tu ghi 'thu X' trong van ban khong doi chieu duoc ngay (sua tay kiem tra)" % loose)

    print()
    if errs:
        for e in errs:
            out("[ERR] " + e)
    if warns:
        for w in warns:
            out("[WARN] " + w)
    if errs:
        out("PREFLIGHT FAIL (%d ERR)" % len(errs))
        return 1
    out("PREFLIGHT OK" + (" (%d warn)" % len(warns) if warns else ""))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print("[ERR] " + redact(str(e)), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print("[ERR] " + redact(str(e)), file=sys.stderr)
        sys.exit(1)
