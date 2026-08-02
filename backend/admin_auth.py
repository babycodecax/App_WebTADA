"""admin_auth.py — Xác thực admin chung cho các router quản trị.

Trước đây _get_admin_password/_check_admin bị nhân bản trong upload_routes.py
và source_routes.py — fix MEDIUM: gom về 1 module dùng chung.

Các router KHÔNG được đổi hành vi: vẫn đọc ADMIN_PASSWORD MỖI LẦN gọi
(.env thay đổi sau khi server start có hiệu lực ngay).
"""
import hmac
import os

from fastapi import HTTPException, Request


def _get_admin_password() -> str:
    """Đọc ADMIN_PASSWORD MỖI LẦN gọi — .env thay đổi sau khi server start
    vẫn có hiệu lực ngay (trước đây đọc 1 lần lúc import: server start khi
    chưa đặt password thì mọi admin endpoint trả 401 tới khi restart)."""
    return os.getenv("ADMIN_PASSWORD", "")


def check_admin(request: Request) -> None:
    """Xác thực Bearer token so với ADMIN_PASSWORD (chống timing attack)."""
    password = _get_admin_password()
    if not password:
        raise HTTPException(status_code=401, detail="ADMIN_PASSWORD chưa được cấu hình")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Cần token quản trị")
    token = auth.replace("Bearer ", "", 1)
    if not hmac.compare_digest(token, password):
        raise HTTPException(status_code=401, detail="Token quản trị không hợp lệ")
