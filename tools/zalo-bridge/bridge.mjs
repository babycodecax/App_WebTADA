import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const TOKEN = process.env.ZALO_BOT_TOKEN;
const VAULT = resolve(process.env.VAULT_DIR || "D:\\Projects\\App_WebTADA\\vault");
const SEEN_FILE = "D:\\Projects\\App_WebTADA\\tools\\zalo-bridge\\seen.json";
const MAX_INPUT = 1500;
const MAX_QUEUE = 20;
const RATE_N = 5;
const RATE_MS = 60 * 1000;
if (!TOKEN) { console.error("Thieu ZALO_BOT_TOKEN"); process.exit(1); }
if (!VAULT.startsWith("D:\\Projects\\App_WebTADA\\vault") || !existsSync(VAULT)) {
  console.error("VAULT khong hop le:", VAULT); process.exit(1);
}
const API = `https://bot-api.zaloplatforms.com/bot${TOKEN}`;
const seen = new Set();
try {
  for (const id of JSON.parse(readFileSync(SEEN_FILE, "utf-8"))) seen.add(String(id));
} catch { /* file chua co */ }
function luuSeen() {
  try { writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-2000))); } catch { /* bo qua */ }
}
const queue = [];
const rate = new Map();
// Lịch sử hội thoại theo chat (cho câu nối tiếp) — RAM only, tối đa 12 msg/chat,
// tối đa MAX_CHATS chat, chat quá TTL_MS không hoạt động sẽ bị loại (chống OOM)
const lichSu = new Map();
const lichSuODau = new Map();
const MAX_LICHSU = 12;
const MAX_CHATS = 500;
const TTL_MS = 24 * 60 * 60 * 1000;
function layLichSu(chatId) { return lichSu.get(chatId) || []; }
function themLichSu(chatId, role, content) {
  const arr = lichSu.get(chatId) || [];
  arr.push({ role, content: String(content || "").slice(0, 500) });
  lichSu.set(chatId, arr.slice(-MAX_LICHSU));
  lichSuODau.set(chatId, Date.now());
  if (lichSu.size > MAX_CHATS) {
    const thua = [...lichSuODau.entries()].sort((a, b) => a[1] - b[1]);
    for (const [id] of thua.slice(0, lichSu.size - MAX_CHATS)) {
      lichSu.delete(id); lichSuODau.delete(id); rate.delete(id);
    }
  }
}
let inflight = 0;
const MAX_PARALLEL = 3;
let logRawOnce = false;

async function api(method, body, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}), signal: ctl.signal,
    });
    if (!r.ok) return { ok: false, description: "http " + r.status };
    try { return await r.json(); } catch { return { ok: false, description: "non-json" }; }
  } catch (e) {
    return { ok: false, description: String(e).slice(0, 100) };
  } finally { clearTimeout(t); }
}

function bocSuKien(data) {
  const res = data?.result;
  let items = [];
  if (Array.isArray(res)) items = res;
  else if (res && typeof res === "object") {
    if (res.message || res.event_name) items = [res];
    else for (const k of ["updates", "messages", "events", "data"]) {
      if (Array.isArray(res[k])) { items = res[k]; break; }
    }
  }
  const ra = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    let msg = it.message;
    if (!msg || typeof msg !== "object") msg = it.message_id ? it : null;
    if (!msg) continue;
    ra.push({ event: it.event_name ? String(it.event_name) : "", msg });
  }
  return ra;
}

function layText(msg) {
  if (typeof msg.text === "string") return msg.text;
  if (typeof msg.message?.text === "string") return msg.message.text;
  if (typeof msg.data?.text === "string") return msg.data.text;
  return "";
}
function layChatId(msg) { return String(msg.chat?.id || msg.from?.id || ""); }
function quaRate(chatId) {
  const now = Date.now();
  const arr = (rate.get(chatId) || []).filter((t) => now - t < RATE_MS);
  arr.push(now); rate.set(chatId, arr);
  if (rate.size > MAX_CHATS + 100) {
    let cuNhat = null, cuGio = Infinity;
    for (const [id, ts] of rate) {
      const last = ts.length ? ts[ts.length - 1] : 0;
      if (last < cuGio) { cuGio = last; cuNhat = id; }
    }
    if (cuNhat) rate.delete(cuNhat);
  }
  return arr.length <= RATE_N;
}

async function hoiOpenCode(cauHoi, lichSuTruoc) {
  // Tìm trực tiếp trong vault local (không qua opencode CLI — CLI treo sau
  // init ở môi trường này; không qua API web — giữ Zalo tách khỏi TADA).
  try {
    return timTrongVault(cauHoi, lichSuTruoc);
  } catch (e) {
    console.error("[vault loi] " + String(e && e.message || e).slice(0, 200));
    return "Xin lỗi, tôi đang bận. Bạn nhắn lại sau 1 phút giúp nhé.";
  }
}

const STOP = new Set("và của là được trong với cho năm các có theo tại từ để khi nào bao nhiêu làm sao thế này như về còn đã sẽ đang bị không những một hai ba ngày tháng mấy đó thì gì thế nào ạ ơi nhé".split(" "));
const TAX_DIR = join(VAULT, "thue-ke-toan");
let vaultCache = null;
function napVault() {
  if (vaultCache) return vaultCache;
  const files = [];
  (function walk(dir) {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      const p = join(dir, n);
      let st = null;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (n.endsWith(".md") && n !== "_template.md" && n !== "_index.md") files.push(p);
    }
  })(TAX_DIR);
  vaultCache = files;
  console.log("[vault] nap " + files.length + " notes");
  return files;
}
function tachTerms(s) {
  return String(s || "").toLowerCase().split(/[\s,.\-:;!?()\/"]+/).filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}
function lamSach(s) {
  return String(s || "").replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "").replace(/__/g, "")
    .replace(/^>\s?/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}
function laRacFrontmatter(doan) {
  return /^(title|domain|tags|source|status|updated|created|aliases)\s*:/im.test(doan) || /^---/.test(doan);
}
function chamDiem(hay, terms) {
  let diem = 0;
  for (const t of terms) {
    if (/\d/.test(t)) {
      // Số (nhóm 3, 15%, 90 ngày...) là đáp án thật — cho điểm cao
      const re = new RegExp(`[^\\p{L}\\p{N}_]${t}[^\\p{L}\\p{N}_]`, "u");
      if (re.test(" " + hay + " ")) diem += 5;
      else if (hay.includes(t)) diem += 1;
      continue;
    }
    if (t.length === 1) { if (hay.includes(t)) diem += 1; continue; }
    const re = new RegExp(`[^\\p{L}\\p{N}_]${t}[^\\p{L}\\p{N}_]`, "u");
    if (re.test(" " + hay + " ")) diem += t.length >= 4 ? 3 : 2;
    else if (hay.includes(t)) diem += 1;
  }
  // Phạt đoạn boilerplate mở đầu văn bản (không bao giờ là đáp án)
  if (/^(nội dung|tóm tắt)\b/i.test(hay) || hay.includes("quy định chi tiết một số điều")) diem -= 6;
  // Thưởng đoạn nhắc đúng phân nhóm hỏi (nhóm 1/2/3/4 là tiêu chí phân biệt chính)
  if (/nhóm\s*[1234](\s*,|\s|$)/.test(hay)) diem += 4;
  return diem;
}
function timTrongVault(cauHoi, lichSuTruoc) {
  const them = (lichSuTruoc || []).filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const terms = tachTerms(cauHoi + " " + them);
  if (!terms.length) return "Bạn hỏi rõ hơn giúp tôi nhé (ví dụ: thuế suất TNCN 2026 là bao nhiêu?).";
  const files = napVault();
  // Chấm theo ĐOẠN (paragraph) thay vì cả file — lấy đúng chỗ liên quan,
  // không dump đầu file + không cắt ngang bảng.
  const doans = [];
  for (const f of files) {
    let raw = "";
    try { raw = readFileSync(f, "utf-8"); } catch { continue; }
    const text = lamSach(raw);
    if (!text) continue;
    for (const p of text.split(/\r?\n\s*\r?\n/)) {
      const doan = p.replace(/\s+/g, " ").trim();
      if (!doan || doan.length < 20 || laRacFrontmatter(doan)) continue;
      // Bỏ hàng bảng điều hướng (toàn wikilink / dòng kẻ bảng)
      const links = (doan.match(/\[\[/g) || []).length;
      if (links >= 2 || /^\|[\s:\-|]+\|?$/.test(doan)) continue;
      const diem = chamDiem(doan.toLowerCase(), terms);
      if (diem > 0) doans.push({ doan, diem });
    }
  }
  doans.sort((a, b) => b.diem - a.diem);
  if (!doans.length) return "Tôi chưa tìm thấy thông tin này trong kho tài liệu thuế. Bạn hỏi theo cách khác giúp nhé.";
  // Gộp đoạn tốt nhất, mỗi đoạn ≤450 ký tự (cắt hết câu), tổng ~1400
  let gop = "";
  const thay = new Set();
  for (const u of doans.slice(0, 12)) {
    let d = u.doan;
    if (d.length > 450) {
      const cat = d.lastIndexOf(".", 450);
      d = (cat > 200 ? d.slice(0, cat + 1) : d.slice(0, 450).replace(/\s+\S*$/, "")) + "...";
    }
    const khoa = d.slice(0, 60);
    if (thay.has(khoa)) continue;
    thay.add(khoa);
    if ((gop + "\n- " + d).length > 1450) break;
    gop += "\n- " + d;
  }
  return gop.trim().replace(/^\n/, "") || "Tôi chưa tìm thấy thông tin này trong kho tài liệu thuế. Bạn hỏi theo cách khác giúp nhé.";
}

function catTin(text, n = 1900) {
  const ra = [];
  let s = text;
  while (s.length > n) {
    let cat = s.lastIndexOf("\n", n);
    if (cat < n * 0.5) cat = n;
    ra.push(s.slice(0, cat)); s = s.slice(cat).replace(/^\n/, "");
  }
  if (s) ra.push(s);
  return ra;
}

async function xuLy() {
  if (inflight >= MAX_PARALLEL) return;
  inflight++;
  try {
    while (queue.length) {
      const { chatId, text } = queue.shift();
      try {
        if (text === "__KHONG_CHU__") {
          await api("sendMessage", { chat_id: chatId, text: "Bot hiện chỉ đọc được tin nhắn chữ. Bạn gõ câu hỏi thành chữ giúp nhé." });
          continue;
        }
        await api("sendChatAction", { chat_id: chatId, action: "typing" });
        const traLoi = await hoiOpenCode(text, layLichSu(chatId));
        themLichSu(chatId, "user", text);
        themLichSu(chatId, "assistant", traLoi);
        const phan = catTin(traLoi).map((p, i, a) => (a.length > 1 ? `(${i + 1}/${a.length}) ` + p : p));
        for (const p of phan) {
          const kq = await api("sendMessage", { chat_id: chatId, text: p });
          if (kq && kq.ok === false) console.error("[sendMessage] " + String(kq.description || "").slice(0, 120));
        }
        console.log(`[ok] chat=${chatId} dai=${text.length}`);
      } catch (e) {
        console.error("[loi xu ly]", String(e).slice(0, 200));
      }
    }
  } finally {
    inflight--;
    if (queue.length) xuLy();
  }
}

async function poll() {
  while (true) {
    try {
      const d = await api("getUpdates", { timeout: 25 }, 40000);
      if (d?.ok === false && /timeout|no update|empty|non-json/i.test(d?.description || "")) continue;
      if (d?.ok === false) {
        console.error("[getUpdates]", String(d?.description || "").slice(0, 120));
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      for (const { event, msg } of bocSuKien(d)) {
        if (!logRawOnce) { logRawOnce = true; console.log("[mau event] co tin moi"); }
        const mid = String(msg.message_id || "");
        const chatId = layChatId(msg);
        if (!chatId) continue;
        const text = layText(msg).trim();
        const laChu = text.length > 0 && (event === "message.text.received" || event === "");
        if (mid) {
          if (seen.has(mid)) continue;
          seen.add(mid); luuSeen();
        } else {
          const key = chatId + "|" + text.slice(0, 50);
          if (seen.has(key)) continue;
          seen.add(key);
        }
        if (queue.length >= MAX_QUEUE) {
          await api("sendMessage", { chat_id: chatId, text: "Bot đang bận, bạn chờ 1 phút rồi hỏi lại giúp nhé." });
          continue;
        }
        if (!laChu) { queue.push({ chatId, text: "__KHONG_CHU__" }); }
        else {
          if (!quaRate(chatId)) {
            await api("sendMessage", { chat_id: chatId, text: "Bạn nhắn nhanh quá, chờ 1 phút rồi hỏi tiếp giúp nhé." });
            continue;
          }
          queue.push({ chatId, text });
        }
        xuLy();
      }
    } catch (e) {
      console.error("[loi poll]", String(e).slice(0, 200));
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

process.on("SIGINT", () => { luuSeen(); process.exit(0); });
process.on("SIGTERM", () => { luuSeen(); process.exit(0); });
console.log("Cau noi Zalo-OpenCode chay. Vault:", VAULT);
poll();
