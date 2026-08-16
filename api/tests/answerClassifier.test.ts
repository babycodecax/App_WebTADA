/**
 * Unit tests — lib/answerClassifier.ts (phân loại "không có kiến thức" vs "lỗi hệ thống").
 *
 * 4 tổ hợp bắt buộc (spec review):
 *   1. contexts rỗng + không compliance → no-knowledge
 *   2. contexts có + không compliance → call-llm
 *   3. contexts rỗng + CÓ compliance → call-llm (fix MEDIUM — có dữ liệu
 *      structured vẫn phải trả lời được)
 *   4. contexts có + có compliance → call-llm
 *
 * Module thuần: không import Supabase/OpenAI. Cách chạy (từ api/):
 *   node --import tsx --test tests/answerClassifier.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'answerClassifier.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

const { classifyAnswer } = lib;

test('contexts rỗng + KHÔNG có compliance → no-knowledge (trả lời trung thực)', () => {
  assert.equal(classifyAnswer(false, false), 'no-knowledge');
});

test('contexts CÓ + không compliance → call-llm (trả lời từ tài liệu)', () => {
  assert.equal(classifyAnswer(true, false), 'call-llm');
});

test('contexts rỗng + CÓ compliance → call-llm (fix MEDIUM — vẫn có dữ liệu structured)', () => {
  // Trước đây: contexts.length === 0 return sớm → khách nhận "chưa có đủ thông
  // tin" dù searchCompliance tìm được records. Giờ phải gọi LLM với compliance.
  assert.equal(classifyAnswer(false, true), 'call-llm');
});

test('contexts CÓ + CÓ compliance → call-llm (ưu tiên số liệu structured)', () => {
  assert.equal(classifyAnswer(true, true), 'call-llm');
});
