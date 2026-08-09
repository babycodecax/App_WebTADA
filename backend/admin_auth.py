"""admin_auth.py — Xác thực admin chung cho các router quản trị.

THỐNG NHẤT: chỉ dùng TÀI KHOẢN GOOGLE được cấp quyền (ADMIN_EMAILS).
Bỏ mật khẩu ADMIN_PASSWORD — check_admin verify JWT access token của
Supabase (Google OAuth) rồi so email với danh sách ADMIN_EMAILS.
"""
import os

from fastapi import HTTPException, Request


def _get_admin_emails() -> set[str]:
    """Đọc ADMIN_EMAILS MỖI LẦN gọi — .env thay đổi sau khi server start
    vẫn có hiệu lực ngay."""
    return {
        email.strip().lower()
        for email in os.getenv("ADMIN_EMAILS", "").split(",")
        if email.strip()
    }


def check_admin(request: Request) -> str:
    """Xác thực Bearer token Google (Supabase access token) + email ∈ ADMIN_EMAILS.
    Trả về email admin nếu hợp lệ; ném 401/403 nếu không."""
    admins = _get_admin_emails()
    if not admins:
        raise HTTPException(status_code=401, detail="ADMIN_EMAILS chưa được cấu hình")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Cần đăng nhập")
    token = auth.replace("Bearer ", "", 1)
    try:
        from supabase import create_client

        url = os.getenv("SUPABASE_URL", "")
        anon = os.getenv("SUPABASE_ANON_KEY", "")
        if not url or not anon:
            raise HTTPException(status_code=500, detail="Supabase chưa được cấu hình")
        supabase = create_client(url, anon)
        user = supabase.auth.get_user(token)
        email = (user.user.email or "").lower().strip()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token không hợp lệ") from None
    if not email or email not in admins:
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản trị")
    return email
