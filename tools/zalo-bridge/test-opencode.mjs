import { execFile } from "node:child_process";
import { promisify } from "node:util";
const runFile = promisify(execFile);
const EXE = "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe";
const VAULT = "D:\\Projects\\App_WebTADA\\vault";
const prompt = `Bạn là trợ lý TADA. Trả lời TIẾNG VIỆT CÓ DẤU ĐẦY ĐỦ dưới 300 ký tự. Câu hỏi: thuế TNCN là gì?`;
const t0 = Date.now();
try {
  const { stdout } = await runFile(EXE, ["run", "--dir", VAULT, prompt],
    { encoding: "utf-8", timeout: 300000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  console.log("THANH CONG sau " + Math.round((Date.now() - t0) / 1000) + "s, dai=" + String(stdout).length);
  console.log(String(stdout).slice(0, 300));
} catch (e) {
  console.log("GAY sau " + Math.round((Date.now() - t0) / 1000) + "s code=" + e.code + " signal=" + e.signal);
  console.log("STDERR: " + String(e.stderr || "").replace(/\r/g, "").slice(-500));
}
