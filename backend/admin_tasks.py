"""Read-only administrative access to locally received tasks."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from admin_auth import require_admin

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
TASK_ID = re.compile(r"[0-9a-f]{32}")
MAX_FILE_BYTES = 10 * 1024 * 1024

router = APIRouter(
    prefix="/api/admin/tasks",
    tags=["admin tasks"],
    dependencies=[Depends(require_admin)],
)


def read_task(folder: Path) -> dict:
    root = UPLOAD_DIR.resolve()
    if not TASK_ID.fullmatch(folder.name) or folder.is_symlink() or folder.resolve() != root / folder.name:
        raise ValueError("Invalid task directory")
    metadata = folder / "request.json"
    patch = folder / "change.patch"
    for path in (metadata, patch):
        if path.is_symlink() or path.resolve() != root / folder.name / path.name or not path.is_file():
            raise ValueError("Invalid task file")
    if metadata.stat().st_size > 128 * 1024:
        raise ValueError("Metadata too large")
    data = json.loads(metadata.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("id") != folder.name:
        raise ValueError("Invalid task metadata")
    filename = data["filename"]
    message = data["commitMessage"]
    size = data["size"]
    if (not isinstance(filename, str) or not filename or len(filename) > 255
            or not isinstance(message, str) or not message.strip() or len(message) > 4000
            or type(size) is not int or not 0 < size <= MAX_FILE_BYTES
            or patch.stat().st_size != size or data.get("status") != "received"):
        raise ValueError("Invalid task fields")
    # Historical submissions did not store a timestamp; use the metadata
    # modification time as an explicitly labelled fallback.
    stored_time = data.get("createdAt")
    if stored_time is None:
        created = datetime.fromtimestamp(metadata.stat().st_mtime, timezone.utc)
        source = "metadata_mtime"
    else:
        created = datetime.fromisoformat(stored_time)
        if created.tzinfo is None:
            raise ValueError("Missing timestamp timezone")
        created = created.astimezone(timezone.utc)
        source = "recorded"
    return {
        "id": folder.name,
        "filename": filename,
        "size": size,
        "commitMessage": message,
        "status": "received",
        "createdAt": created.isoformat(timespec="microseconds"),
        "timeSource": source,
    }


@router.get("")
def list_tasks(
    response: Response,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    response.headers["Cache-Control"] = "no-store"
    tasks = []
    skipped = 0
    try:
        if UPLOAD_DIR.exists():
            for folder in UPLOAD_DIR.iterdir():
                if not TASK_ID.fullmatch(folder.name):
                    continue
                try:
                    # An in-progress upload has not published its metadata yet.
                    if not (folder / "request.json").exists():
                        continue
                    tasks.append(read_task(folder))
                except (OSError, ValueError, TypeError, KeyError, RuntimeError, OverflowError):
                    skipped += 1
    except OSError:
        raise HTTPException(503, "任务目录暂时无法读取。")
    tasks.sort(key=lambda task: (task["createdAt"], task["id"]), reverse=True)
    return {
        "items": tasks[offset:offset + limit],
        "total": len(tasks),
        "offset": offset,
        "limit": limit,
        "skipped": skipped,
    }
