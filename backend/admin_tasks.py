"""Administrative task listing and review; never executes a patch."""
import json
import re
import threading
from typing import Literal
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from admin_auth import require_admin
from branch_config import ID_PATTERN, MAX_BRANCHES, valid_branch_ref
from pydantic import BaseModel

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
TASK_ID = re.compile(r"[0-9a-f]{32}")
MAX_FILE_BYTES = 10 * 1024 * 1024
REVIEW_LOCK = threading.Lock()


class ReviewRequest(BaseModel):
    decision: Literal['approved', 'rejected']

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
            or patch.stat().st_size != size or data.get("status") not in ("received", "pending_review", "approved", "rejected")):
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
        source = data.get("timeSource", "recorded")
        if source not in ("recorded", "metadata_mtime"):
            raise ValueError("Invalid timestamp source")
    status = "pending_review" if data["status"] == "received" else data["status"]
    reviewed_at = data.get("reviewedAt")
    if status in ("approved", "rejected"):
        if not isinstance(reviewed_at, str) or datetime.fromisoformat(reviewed_at).tzinfo is None:
            raise ValueError("Invalid review timestamp")
    else:
        reviewed_at = None
    targets = data.get("branchTargets")
    public_targets = None
    if targets is not None:
        def public_branch(item):
            if (not isinstance(item, dict)
                    or not isinstance(item.get("id"), str)
                    or not ID_PATTERN.fullmatch(item["id"])
                    or not isinstance(item.get("label"), str)
                    or not item["label"].strip() or len(item["label"]) > 100
                    or not valid_branch_ref(item.get("ref"))):
                raise ValueError("Invalid branch snapshot")
            return {"id": item["id"], "label": item["label"]}

        development = targets["development"]
        cherry = targets["cherryPick"]
        if not isinstance(cherry, list) or len(cherry) > MAX_BRANCHES:
            raise ValueError("Invalid cherry-pick snapshot")
        public_targets = {"development": public_branch(development),
                          "cherryPick": [public_branch(item) for item in cherry]}
        refs = [development["ref"]] + [item["ref"] for item in cherry]
        if len(set(refs)) != len(refs):
            raise ValueError("Duplicate branch snapshot")
    return {
        "id": folder.name,
        "targets": public_targets,
        "filename": filename,
        "size": size,
        "commitMessage": message,
        "status": status,
        "reviewedAt": reviewed_at,
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


@router.post("/{task_id}/review")
def review_task(task_id: str, body: ReviewRequest, response: Response):
    """Only pending tasks can be reviewed. Does not dispatch any work."""
    response.headers["Cache-Control"] = "no-store"
    if not TASK_ID.fullmatch(task_id):
        raise HTTPException(404, "任务不存在。")
    folder = UPLOAD_DIR / task_id
    with REVIEW_LOCK:
        try:
            if not (folder / "request.json").exists():
                raise HTTPException(404, "任务不存在或尚未上传完成。")
            task = read_task(folder)
        except (OSError, ValueError, TypeError, KeyError, RuntimeError, OverflowError):
            raise HTTPException(409, "任务记录异常，无法审核。")
        if task["status"] != "pending_review":
            raise HTTPException(409, "任务已审核，请刷新列表。")
        task["status"] = body.decision
        task["reviewedAt"] = datetime.now(timezone.utc).isoformat()
        # Preserve extra metadata fields and the original submission time,
        # including the historical modification-time fallback.
        temporary = folder / "review.tmp"
        try:
            original = json.loads((folder / "request.json").read_text(encoding="utf-8"))
            # Public targets omit private refs. Keep the original snapshot intact.
            original.update({key: value for key, value in task.items() if key != 'targets'})
            with temporary.open("x", encoding="utf-8") as output:
                json.dump(original, output, ensure_ascii=False, indent=2)
                output.write("\n")
            temporary.replace(folder / "request.json")
        except (OSError, ValueError, TypeError):
            raise HTTPException(503, "无法保存审核结果，请检查任务目录。")
        finally:
            # Only the single local server manages this temporary filename.
            temporary.unlink(missing_ok=True)
        return task
