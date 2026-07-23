-- Bảng ghi log hoạt động người dùng (login, câu hỏi)
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    user_name TEXT DEFAULT '',
    action TEXT NOT NULL,         -- 'login', 'question'
    detail TEXT DEFAULT '',       -- nội dung câu hỏi (nếu action='question')
    question_count INTEGER DEFAULT 0,  -- số thứ tự câu hỏi trong phiên
    ip_address TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index cho search
CREATE INDEX IF NOT EXISTS idx_activity_logs_email ON activity_logs (email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs (created_at DESC);

-- RLS: chỉ server-side mới ghi
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server only insert" ON activity_logs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin only select" ON activity_logs
    FOR SELECT USING (auth.role() = 'service_role');
