import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile

from admin_auth import router as admin_router
from admin_tasks import UPLOAD_DIR, router as tasks_router
from branch_config import resolve_targets, router as branches_router

app = FastAPI(title="PatchCenter API")
app.include_router(admin_router)
app.include_router(tasks_router)
app.include_router(branches_router)

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_FILE_BYTES + 128 * 1024


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.middleware("http")
async def limit_upload(request: Request, call_next):
    # Browser multipart uploads include Content-Length. Bound the request
    # before FastAPI parses multipart; reject unsupported chunked uploads.
    path = request.url.path.rstrip("/")
    if request.method == "POST" and path in {"/api/patches", "/api/admin/login"}:
        from fastapi.responses import JSONResponse

        length = request.headers.get("content-length")
        if length is None:
            return JSONResponse(status_code=411, content={"detail": "需要 Content-Length。"})
        try:
            size = int(length)
        except ValueError:
            size = -1
        if size < 0:
            return JSONResponse(status_code=400, content={"detail": "请求长度无效。"})
        limit = 4096 if path == "/api/admin/login" else MAX_REQUEST_BYTES
        if size > limit:
            return JSONResponse(status_code=413, content={"detail": "上传请求过大。"})
    return await call_next(request)


@app.post("/api/patches", status_code=201)
def submit_patch(
    patch: UploadFile = File(...),
    commit_message: str = Form(...),
    development_branch_id: str = Form(...),
    cherry_pick_branch_ids: list[str] = Form(default=[]),
):
    # Never use a client-provided name as a filesystem path.
    filename = (patch.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if not filename or len(filename) > 255 or Path(filename).suffix.lower() not in {".patch", ".diff"}:
        raise HTTPException(400, "请选择 .patch 或 .diff 格式的文件。")
    if not commit_message.strip() or len(commit_message.encode("utf-16-le")) // 2 > 4000:
        raise HTTPException(400, "Commit Message 必填，长度不能超过 4000。")

    targets = resolve_targets(development_branch_id, cherry_pick_branch_ids)
    upload_id = uuid4().hex
    folder = UPLOAD_DIR / upload_id
    folder.mkdir(parents=True, exist_ok=False)
    try:
        size = 0
        with (folder / "change.patch").open("wb") as output:
            while chunk := patch.file.read(64 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(413, "文件大小不能超过 10 MB。")
                output.write(chunk)
        if size == 0:
            raise HTTPException(400, "不能提交空文件。")

        metadata = {
            "id": upload_id,
            "filename": filename,
            "size": size,
            "commitMessage": commit_message,
            "status": "pending_review",
            "branchTargets": targets,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        (folder / "request.tmp").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (folder / "request.tmp").replace(folder / "request.json")
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise

    return {"id": upload_id, "filename": filename, "size": size, "status": "pending_review"}
