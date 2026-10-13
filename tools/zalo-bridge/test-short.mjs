import { execFile } from "node:child_process";
import { promisify } from "node:util";
const runFile = promisify(execFile);
const EXE = "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe";
const VAULT = "D:\\Projects\\App_WebTADA\\vault";
const t0 = Date.now();
try {
  const { stdout } = await runFile(EXE, ["run", "--dir", VAULT, "Chao"],
    { encoding: "utf-8", timeout: 120000, windowsHide: true });
  console.log("THANH CONG sau " + Math.round((Date.now() - t0) / 1000) + "s");
  console.log(String(stdout).slice(0, 200));
} catch (e) {
  console.log("GAY sau " + Math.round((Date.now() - t0) / 1000) + "s code=" + e.code + " signal=" + e.signal);
}
