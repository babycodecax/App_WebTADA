"""blog.py — API quản lý blog posts qua Supabase.

Endpoints:
  GET  /api/blog          -> danh sách bài published (mặc định 10 bài gần nhất)
  GET  /api/blog/{slug}   -> chi tiết 1 bài
  POST /api/blog          -> tạo bài mới (admin, verify JWT)
  PUT  /api/blog/{id}     -> sửa bài
  DELETE /api/blog/{id}   -> xoá bài
"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from db import get_client

load_dotenv()

logger = logging.getLogger("obsidian-chatbot.blog")

router = APIRouter(prefix="/api/blog", tags=["blog"])


# === Models ===
class BlogPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=200, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    summary: str = Field(default="", max_length=500)
    content: str = Field(..., min_length=1)
    status: str = Field(default="published", pattern=r'^(draft|published)$')


class BlogPostUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    content: str | None = None
    status: str | None = None


# === Helpers ===
ADMIN_EMAILS = set(
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
)


def _require_admin(request: Request) -> str:
    """Trích xuất email và kiểm tra admin. Ném 401 nếu không phải admin."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Cần đăng nhập")
    try:
        from supabase.lib.client_options import ClientOptions
        supabase = get_client()
        token = auth.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        email = (user.user.email or "").lower().strip()
    except Exception:
        raise HTTPException(status_code=401, detail="Token không hợp lệ") from None
    if not email or not ADMIN_EMAILS or email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Bạn không có quyền viết bài")
    return email


def _slugify(text: str) -> str:
    """Tạo slug từ tiêu đề."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s-]+', '-', s)
    return s.strip('-')


# === Routes ===
@router.get("")
def list_posts(status: str = "published", limit: int = 12, offset: int = 0) -> dict[str, Any]:
    """Danh sách bài viết (mặc định published, 12 bài, phân trang)."""
    client = get_client()
    # Đếm total trước
    count_query = client.table("blog_posts").select("*", count="exact")
    if status == "published":
        count_query = count_query.eq("status", "published")
    count_res = count_query.execute()
    total = count_res.count if hasattr(count_res, 'count') else 0

    # Lấy data
    query = client.table("blog_posts").select("*")
    if status == "published":
        query = query.eq("status", "published")
    query = query.order("published_at", desc=True).limit(limit).offset(offset)
    res = query.execute()

    return {
        "data": res.data or [],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{slug}")
def get_post(slug: str) -> dict[str, Any]:
    """Chi tiết 1 bài viết theo slug."""
    client = get_client()
    res = client.table("blog_posts").select("*").eq("slug", slug).limit(1).execute()
    data = res.data or []
    if not data:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")
    return data[0]


@router.post("")
def create_post(req: BlogPostCreate, request: Request) -> dict[str, Any]:
    """Tạo bài viết mới (yêu cầu admin JWT)."""
    email = _require_admin(request)

    slug = req.slug or _slugify(req.title)

    client = get_client()
    # Kiểm tra slug đã tồn tại chưa
    existing = client.table("blog_posts").select("id").eq("slug", slug).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Slug '{slug}' đã tồn tại")

    row = {
        "title": req.title,
        "slug": slug,
        "summary": req.summary,
        "content": req.content,
        "status": req.status,
        "published_at": datetime.now(timezone.utc).isoformat() if req.status == "published" else None,
        "author_email": email,
    }
    res = client.table("blog_posts").insert(row).execute()
    return res.data[0] if res.data else row


@router.put("/{post_id}")
def update_post(post_id: str, req: BlogPostUpdate, request: Request) -> dict[str, Any]:
    """Sửa bài viết (yêu cầu admin JWT)."""
    email = _require_admin(request)

    update: dict[str, Any] = {}
    for field in ("title", "slug", "summary", "content", "status"):
        val = getattr(req, field, None)
        if val is not None:
            update[field] = val
    if "status" in update:
        update["published_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    if not update:
        raise HTTPException(status_code=400, detail="Không có gì để cập nhật")

    client = get_client()
    res = client.table("blog_posts").update(update).eq("id", post_id).execute()
    data = res.data or []
    if not data:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")
    return data[0]


@router.delete("/{post_id}")
def delete_post(post_id: str, request: Request) -> dict[str, str]:
    """Xoá bài viết."""
    email = _require_admin(request)

    client = get_client()
    res = client.table("blog_posts").delete().eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Bài viết không tồn tại")
    return {"status": "ok"}
