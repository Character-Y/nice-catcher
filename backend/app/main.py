from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import requests
from supabase import Client, create_client

API_PREFIX = "/api/v1"
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
AUDIO_DIR = DATA_DIR / "audio"
MEMOS_PATH = DATA_DIR / "memos.json"
USE_MOCK = os.getenv("USE_MOCK", "true").lower() in {"1", "true", "yes"}
STATIC_DIR = Path(os.getenv("STATIC_DIR", "./static"))
INDEX_FILE = STATIC_DIR / "index.html"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "memos-audio")
AI_BUILDER_TOKEN = os.getenv("AI_BUILDER_TOKEN")
AI_BUILDER_BASE_URL = os.getenv("AI_BUILDER_BASE_URL", "https://space.ai-builders.com")

_supabase: Optional[Client] = None


class Memo(BaseModel):
    id: str
    content: Optional[str] = None
    audio_path: str
    project_id: Optional[str] = None
    status: str = "pending"
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str


class MemoUpdate(BaseModel):
    content: Optional[str] = None
    project_id: Optional[str] = None
    new_project_name: Optional[str] = None
    status: Optional[str] = None


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    if not MEMOS_PATH.exists():
        MEMOS_PATH.write_text("[]", encoding="utf-8")


def load_memos() -> list[dict[str, Any]]:
    ensure_storage()
    raw = MEMOS_PATH.read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


def save_memos(memos: list[dict[str, Any]]) -> None:
    ensure_storage()
    MEMOS_PATH.write_text(json.dumps(memos, ensure_ascii=True, indent=2), encoding="utf-8")


def parse_attachments(attachments: Optional[str]) -> list[dict[str, Any]]:
    if not attachments:
        return []
    try:
        parsed = json.loads(attachments)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="attachments must be valid JSON") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="attachments must be a JSON array")
    return parsed


def mock_transcription(file_path: Path, original_name: str) -> str:
    return f"Mock transcription for {original_name} ({file_path.name})"


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(status_code=500, detail="Supabase credentials missing")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def upload_to_supabase(audio_path: str, content_type: str, file_bytes: bytes) -> str:
    supabase = get_supabase()
    response = supabase.storage.from_(SUPABASE_BUCKET).upload(
        audio_path,
        file_bytes,
        {"content-type": content_type},
    )
    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail="Failed to upload audio to Supabase")
    return audio_path


def insert_memo_supabase(payload: dict[str, Any]) -> dict[str, Any]:
    supabase = get_supabase()
    response = supabase.table("memos").insert(payload).execute()
    if getattr(response, "data", None):
        return response.data[0]
    raise HTTPException(status_code=500, detail="Failed to create memo")


def update_memo_supabase(memo_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    supabase = get_supabase()
    response = supabase.table("memos").update(payload).eq("id", memo_id).execute()
    if getattr(response, "data", None):
        return response.data[0]
    raise HTTPException(status_code=500, detail="Failed to update memo")


def list_memos_supabase(status: Optional[str], project_id: Optional[str]) -> list[dict[str, Any]]:
    supabase = get_supabase()
    query = supabase.table("memos").select("*")
    if status:
        query = query.eq("status", status)
    if project_id:
        query = query.eq("project_id", project_id)
    response = query.execute()
    return response.data or []


def create_project_if_needed(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    supabase = get_supabase()
    response = supabase.table("projects").insert({"name": name}).execute()
    if getattr(response, "data", None):
        return response.data[0]["id"]
    raise HTTPException(status_code=500, detail="Failed to create project")


def call_transcription_api(filename: str, content_type: str, file_bytes: bytes) -> str:
    if not AI_BUILDER_TOKEN:
        raise HTTPException(status_code=500, detail="AI Builder token missing")
    base_url = AI_BUILDER_BASE_URL.rstrip("/")
    if not base_url.endswith("/backend"):
        base_url = f"{base_url}/backend"
    url = f"{base_url}/v1/audio/transcriptions"
    headers = {
        "Authorization": f"Bearer {AI_BUILDER_TOKEN}",
        "x-api-key": AI_BUILDER_TOKEN,
    }
    files = [
        ("file", (filename, file_bytes, content_type)),
        ("audio", (filename, file_bytes, content_type)),
        ("audio_file", (filename, file_bytes, content_type)),
    ]
    data = {"model": "whisper-1"}
    try:
        response = requests.post(url, headers=headers, files=files, data=data, timeout=60)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Transcription API request error") from exc
    if not response.ok:
        detail = f"Transcription API failed: {response.status_code} {response.text[:200]}"
        raise HTTPException(status_code=502, detail=detail)
    payload = response.json()
    return payload.get("text") or payload.get("transcription") or ""


def find_memo(memos: list[dict[str, Any]], memo_id: str) -> dict[str, Any]:
    for memo in memos:
        if memo["id"] == memo_id:
            return memo
    raise HTTPException(status_code=404, detail="memo not found")


app = FastAPI(title="Nice Catcher API", version="0.1.0")

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post(f"{API_PREFIX}/capture")
async def capture(
    file: UploadFile = File(...),
    attachments: Optional[str] = Form(None),
) -> dict[str, Any]:
    memo_id = str(uuid.uuid4())
    suffix = Path(file.filename or "").suffix or ".wav"
    filename = f"{memo_id}{suffix}"
    content_type = file.content_type or "application/octet-stream"
    file_bytes = await file.read()

    memo_attachments = parse_attachments(attachments)
    memo_payload: dict[str, Any] = {
        "id": memo_id,
        "content": None,
        "audio_path": None,
        "project_id": None,
        "status": "pending",
        "attachments": memo_attachments,
    }

    if USE_MOCK:
        ensure_storage()
        audio_path = AUDIO_DIR / filename
        with audio_path.open("wb") as buffer:
            buffer.write(file_bytes)
        memo_payload["audio_path"] = str(audio_path)
        memo_payload["content"] = mock_transcription(audio_path, file.filename or "audio")
        memo_payload["status"] = "review_needed"
        memo_payload["created_at"] = datetime.now(timezone.utc).isoformat()
        memos = load_memos()
        memos.append(memo_payload)
        save_memos(memos)
        stored_memo = memo_payload
    else:
        audio_path = filename
        memo_payload["audio_path"] = upload_to_supabase(audio_path, content_type, file_bytes)
        stored_memo = insert_memo_supabase(memo_payload)
        transcription = call_transcription_api(filename, content_type, file_bytes)
        stored_memo = update_memo_supabase(
            memo_id,
            {"content": transcription, "status": "review_needed"},
        )

    return {
        "id": memo_id,
        "status": stored_memo["status"],
        "audio_url": stored_memo["audio_path"],
        "estimated_wait": "2s" if USE_MOCK else "pending",
        "memo": stored_memo,
    }


@app.patch(f"{API_PREFIX}/memos" + "/{memo_id}", response_model=Memo)
def update_memo(memo_id: str, payload: MemoUpdate) -> Memo:
    update = payload.model_dump(exclude_unset=True)
    project_name = update.pop("new_project_name", None)
    if project_name and not update.get("project_id"):
        update["project_id"] = create_project_if_needed(project_name)

    update = {k: v for k, v in update.items() if v is not None}

    if USE_MOCK:
        memos = load_memos()
        memo = find_memo(memos, memo_id)
        memo.update(update)
        save_memos(memos)
        return Memo(**memo)

    memo = update_memo_supabase(memo_id, update)
    return Memo(**memo)


@app.get(f"{API_PREFIX}/memos", response_model=list[Memo])
def list_memos(
    status: Optional[str] = None,
    project_id: Optional[str] = None,
) -> list[Memo]:
    if USE_MOCK:
        memos = load_memos()
        results = []
        for memo in memos:
            if status and memo["status"] != status:
                continue
            if project_id and memo["project_id"] != project_id:
                continue
            results.append(Memo(**memo))
        return results

    memos = list_memos_supabase(status, project_id)
    return [Memo(**memo) for memo in memos]


@app.get("/", response_class=HTMLResponse)
def serve_index() -> HTMLResponse:
    if INDEX_FILE.exists():
        return FileResponse(INDEX_FILE)
    return HTMLResponse("<h1>Nice Catcher API</h1>")


@app.get("/{full_path:path}", response_class=HTMLResponse)
def spa_fallback(full_path: str) -> HTMLResponse:
    if full_path.startswith("api/") or full_path.startswith("health"):
        raise HTTPException(status_code=404, detail="not found")
    if INDEX_FILE.exists():
        return FileResponse(INDEX_FILE)
    raise HTTPException(status_code=404, detail="not found")
