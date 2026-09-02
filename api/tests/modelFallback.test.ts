/**
 * Unit tests — lib/modelFallback.ts (cơ chế fallback danh sách model cho chatbox).
 *
 * Không gọi external API: mọi callModel đều là hàm giả (inject qua tham số),
 * env được set/restore trong test.
 *
 * Cách chạy (từ thư mục api/):
 *   node --import tsx --test tests/modelFallback.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = pathToFileURL(path.join(__dirname, '..', 'lib', 'modelFallback.ts')).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib: any = await import(LIB);

const {
  DEFAULT_MODEL,
  parseModelList,
  getModelList,
  getModelProvider,
  getClientForModel,
  describeError,
  streamWithModelFallback,
} = lib;

// --- Helper: mock callModel ---
/** callModel giả: model fail -> throw; model success -> yield token (StreamDelta) */
function mockCallModel(failModels: Set<string>, tokensByModel: Record<string, string[]>) {
  const calls: string[] = [];
  const call = async (model: string) => {
    calls.push(model);
    if (failModels.has(model)) throw new Error('fetch failed (network error)');
    return (async function* () {
      for (const t of tokensByModel[model] || []) yield { content: t };
    })();
  };
  return { call, calls };
}

/** Thu token từ async generator (không dùng onChunk) */
async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const d of gen) out.push(d);
  return out;
}

/** Bắt console.error + console.warn tạm thời (monkey-patch, restore sau test) */
function captureConsoleError() {
  const lines: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

// --- 1. parseModelList ---
test('parseModelList: chuỗi 1 model', () => {
  assert.deepEqual(parseModelList('deepseek-v4-flash'), ['deepseek-v4-flash']);
});

test('parseModelList: danh sách 2-3 model phân tách dấu phẩy', () => {
  assert.deepEqual(parseModelList('gemini/gemma-4-31b-it,deepseek-v4-flash'), [
    'gemini/gemma-4-31b-it',
    'deepseek-v4-flash',
  ]);
  assert.deepEqual(parseModelList('a,b,c'), ['a', 'b', 'c']);
});

test('parseModelList: bỏ khoảng quanh dấu phẩy', () => {
  assert.deepEqual(parseModelList(' gemini/gemma-4-31b-it , deepseek-v4-flash '), [
    'gemini/gemma-4-31b-it',
    'deepseek-v4-flash',
  ]);
});

test('parseModelList: phần tử rỗng bị loại', () => {
  assert.deepEqual(parseModelList('a,,b,'), ['a', 'b']);
});

test('parseModelList: model trùng bị dedupe giữ thứ tự', () => {
  assert.deepEqual(parseModelList('a,b,a,c,b'), ['a', 'b', 'c']);
});

test('parseModelList: undefined / chuỗi rỗng -> default', () => {
  assert.deepEqual(parseModelList(undefined), [DEFAULT_MODEL]);
  assert.deepEqual(parseModelList(null), [DEFAULT_MODEL]);
  assert.deepEqual(parseModelList(''), [DEFAULT_MODEL]);
  assert.deepEqual(parseModelList(' , '), [DEFAULT_MODEL]);
});

// --- 2. getModelProvider (auto-detect từ key prefix) ---
test('getModelProvider: key AIza... -> gemini', () => {
  assert.equal(getModelProvider('AIzaSyD...anything'), 'gemini');
});

test('getModelProvider: key không phải AIza -> llm', () => {
  assert.equal(getModelProvider('sk-abc123'), 'llm');
  assert.equal(getModelProvider('or-key-123'), 'llm');
  assert.equal(getModelProvider(''), 'llm');
});

// --- 3. getClientForModel (env được set/restore trong test) ---
function withEnv(env: Record<string, string>, fn: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const k of Object.keys(env)) {
    saved.set(k, process.env[k]);
    process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('getClientForModel: key AIza -> Gemini baseURL + LLM_API_KEY', () => {
  withEnv({ LLM_API_KEY: 'AIzaSyD...test', LLM_API_BASE_URL: 'https://x.example/v1' }, () => {
    const client = getClientForModel('any-model');
    assert.equal(client.apiKey, 'AIzaSyD...test');
    assert.equal(client.baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  });
});

test('getClientForModel: key không phải AIza -> LLM_API_BASE_URL (strip trailing slash)', () => {
  withEnv({ LLM_API_KEY: 'sk-abc', LLM_API_BASE_URL: 'https://x.example/v1/' }, () => {
    const client = getClientForModel('any-model');
    assert.equal(client.apiKey, 'sk-abc');
    assert.equal(client.baseURL, 'https://x.example/v1');
  });
});

test('getClientForModel: thiếu LLM_API_KEY -> throw', () => {
  withEnv({}, () => {
    delete process.env.LLM_API_KEY;
    assert.throws(() => getClientForModel('any-model'), /Missing LLM_API_KEY/);
  });
});

test('getClientForModel: LLM_API_KEY AIza + LLM_API_BASE_URL custom -> dùng Gemini base', () => {
  withEnv({ LLM_API_KEY: 'AIzaSyCustom', LLM_API_BASE_URL: 'https://my-proxy.example/v1' }, () => {
    const client = getClientForModel('gemini-2.0-flash');
    assert.equal(client.apiKey, 'AIzaSyCustom');
    // Gemini base URL luôn dùng generativelanguage
    assert.equal(client.baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  });
});

test('getClientForModel: LLM_API_KEY sk- + LLM_API_BASE_URL custom -> dùng custom base', () => {
  withEnv({ LLM_API_KEY: 'sk-or-123', LLM_API_BASE_URL: 'https://openrouter.ai/api/v1' }, () => {
    const client = getClientForModel('deepseek-v4-flash');
    assert.equal(client.apiKey, 'sk-or-123');
    assert.equal(client.baseURL, 'https://openrouter.ai/api/v1');
  });
});

// --- describeError ---
test('describeError: nhận diện network/timeout, HTTP status, message thường', () => {
  assert.match(describeError(new Error('fetch failed')), /network\/timeout/);
  assert.match(describeError(new Error('request timed out')), /network\/timeout/);
  const httpErr: Error & { status?: number } = new Error('404 model not found');
  httpErr.status = 404;
  assert.match(describeError(httpErr), /HTTP 404/);
  assert.equal(describeError(new Error('bad thing')), 'bad thing');
  assert.equal(describeError('plain string'), 'plain string');
});

// --- 4. Fallback: model đầu fail -> tự chuyển model kế ---
test('fallback: model đầu fail 3 lần -> chuyển sang model kế và yield token', async () => {
  const mock = mockCallModel(new Set(['model-a']), { 'model-b': ['x', 'y'] });
  const captured = captureConsoleError();
  try {
    const tokens = await collect(
      streamWithModelFallback(['model-a', 'model-b'], mock.call, undefined, () => 0)
    );
    assert.deepEqual(tokens, ['x', 'y']);
    // model-a fail đúng 3 lần + model-b thành công
    assert.deepEqual(mock.calls, ['model-a', 'model-a', 'model-a', 'model-b']);
    // Log rõ model fail + lý do + model thay thế (3 warn per-attempt + 1 error chuyển model)
    const switchLine = captured.lines.find(l => /chuyển sang model 'model-b'/.test(l));
    assert.ok(switchLine, 'phải có log chuyển model');
    assert.match(switchLine!, /model 'model-a' fail/);
    assert.match(switchLine!, /network\/timeout/);
    assert.match(switchLine!, /sau 3 lần/);
    assert.equal(captured.lines.filter(l => /attempt \d\/3 fail/.test(l)).length, 3);
  } finally {
    captured.restore();
  }
});

// --- 5. Hành vi 1 model: fail -> throw sau đúng 3 lần gọi ---
test('1 model fail cả 3 lần -> throw lỗi cuối, không gọi thêm', async () => {
  const mock = mockCallModel(new Set(['model-a']), {});
  const captured = captureConsoleError();
  try {
    await assert.rejects(
      collect(streamWithModelFallback(['model-a'], mock.call, undefined, () => 0)),
      /fetch failed/
    );
    assert.deepEqual(mock.calls, ['model-a', 'model-a', 'model-a']);
    // Không có model kế -> không log chuyển model (chỉ 3 dòng warn per-attempt)
    assert.equal(captured.lines.filter(l => /chuyển sang/.test(l)).length, 0);
    assert.equal(captured.lines.length, 3);
  } finally {
    captured.restore();
  }
});

// --- 6a. Model đầu fail, model sau thành công ---
test('model đầu fail -> model sau thành công (nhiều token)', async () => {
  const mock = mockCallModel(new Set(['bad']), { good: ['hello', 'world'] });
  const tokens = await collect(streamWithModelFallback(['bad', 'good'], mock.call, undefined, () => 0));
  assert.deepEqual(tokens, ['hello', 'world']);
});

// --- 6b. Model đầu ra token rồi lỗi giữa stream -> dừng, không chuyển ---
test('model ra token rồi lỗi giữa stream -> dừng ở model đó (không chuyển model khác)', async () => {
  const calls: string[] = [];
  const call = async (model: string) => {
    calls.push(model);
    if (model === 'partial') {
      return (async function* () {
        yield { content: 'tok1' };
        throw new Error('stream broke mid-way');
      })();
    }
    return (async function* () {
      yield { content: 'fallback' };
    })();
  };
  const tokens = await collect(streamWithModelFallback(['partial', 'backup'], call, undefined, () => 0));
  // Chỉ có token của model đầu — không chuyển sang backup
  assert.deepEqual(tokens, ['tok1']);
  assert.deepEqual(calls, ['partial']);
});

// --- getModelList (env đọc lazily) ---
test('getModelList: ưu tiên LLM_MODEL -> CHAT_MODEL -> default', () => {
  withEnv({ LLM_MODEL: 'gemini/gemma-4-31b-it,deepseek-v4-flash' }, () => {
    assert.deepEqual(getModelList(), ['gemini/gemma-4-31b-it', 'deepseek-v4-flash']);
  });
  withEnv({ CHAT_MODEL: 'chat-model-x' }, () => {
    delete process.env.LLM_MODEL;
    assert.deepEqual(getModelList(), ['chat-model-x']);
  });
  withEnv({}, () => {
    delete process.env.LLM_MODEL;
    delete process.env.CHAT_MODEL;
    assert.deepEqual(getModelList(), [DEFAULT_MODEL]);
  });
});

// --- 7. Mới test: kiểm tra không còn đọc GEMINI_API_KEY ---
test('getClientForModel: không còn sử dụng GEMINI_API_KEY', () => {
  // Nếu code vẫn đọc GEMINI_API_KEY thì với LLM_API_KEY rỗng sẽ không throw
  withEnv({ GEMINI_API_KEY: 'should-not-be-used', LLM_API_KEY: 'AIzaSyTest' }, () => {
    // LLM_API_KEY có giá trị AIza -> provider gemini, dùng LLM_API_KEY
    const client = getClientForModel('gemini-2.0-flash');
    assert.equal(client.apiKey, 'AIzaSyTest');
  });
  // Nếu chỉ có GEMINI_API_KEY nhưng không có LLM_API_KEY -> throw
  withEnv({ GEMINI_API_KEY: 'gk-1' }, () => {
    delete process.env.LLM_API_KEY;
    assert.throws(() => getClientForModel('any-model'), /Missing LLM_API_KEY/);
  });
});

// --- 8. Bổ sung test cases mới (bước 4) ---
test('getModelProvider: key rỗng trả về llm', () => {
  assert.equal(getModelProvider(''), 'llm');
});

test('getClientForModel: LLM_API_KEY rỗng -> throw Missing LLM_API_KEY', () => {
  withEnv({ LLM_API_KEY: '' }, () => {
    assert.throws(() => getClientForModel('any-model'), /Missing LLM_API_KEY/);
  });
});

test('getModelProvider: key "AIza" đầy đủ nhưng ngắn -> gemini', () => {
  assert.equal(getModelProvider('AIza'), 'gemini');
});

test('getModelProvider: key "AIZA" hoa -> llm (case-sensitive)', () => {
  assert.equal(getModelProvider('AIZA'), 'llm');
});

test('getClientForModel: LLM_API_KEY AIza mà không có LLM_API_BASE_URL -> dùng Gemini base', () => {
  withEnv({ LLM_API_KEY: 'AIzaSyNoBase' }, () => {
    delete process.env.LLM_API_BASE_URL;
    const client = getClientForModel('gemini-2.0-flash');
    assert.equal(client.baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  });
});

test('getClientForModel: LLM_API_KEY sk- mà không có LLM_API_BASE_URL -> dùng default base', () => {
  withEnv({ LLM_API_KEY: 'sk-no-base' }, () => {
    delete process.env.LLM_API_BASE_URL;
    const client = getClientForModel('deepseek-v4-flash');
    // DEFAULT_LLM_BASE_URL = 'https://opencode.ai/zen/go/v1'
    assert.equal(client.baseURL, 'https://opencode.ai/zen/go/v1');
  });
});

test('fallback: cả 2 model fail -> throw lỗi cuối cùng', async () => {
  const mock = mockCallModel(new Set(['model-a', 'model-b']), {});
  const captured = captureConsoleError();
  try {
    await assert.rejects(
      collect(streamWithModelFallback(['model-a', 'model-b'], mock.call, undefined, () => 0)),
      /fetch failed/
    );
    // Mỗi model gọi đúng 3 lần
    assert.equal(mock.calls.length, 6);
    assert.deepEqual(mock.calls.slice(0, 3), ['model-a', 'model-a', 'model-a']);
    assert.deepEqual(mock.calls.slice(3, 6), ['model-b', 'model-b', 'model-b']);
  } finally {
    captured.restore();
  }
});

test('fallback: empty model list -> dùng DEFAULT_MODEL', async () => {
  const mock = mockCallModel(new Set(), { 'deepseek-v4-flash': ['ok'] });
  const tokens = await collect(
    streamWithModelFallback([], mock.call, undefined, () => 0)
  );
  assert.deepEqual(tokens, ['ok']);
  assert.deepEqual(mock.calls, ['deepseek-v4-flash']);
});
