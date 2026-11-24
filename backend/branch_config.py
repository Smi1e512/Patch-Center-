"""Local-only branch allowlist. Public responses contain aliases, never refs."""
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response

CONFIG_FILE = Path(__file__).resolve().parent / "data" / "branches.json"
ID_PATTERN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}")
MAX_BRANCHES = 50
router = APIRouter(tags=["submission options"])


def valid_branch_ref(value):
    # Conservative subset of Git branch names; actual Git validation belongs
    # to the future execution service. Never use a client string as a command.
    return (isinstance(value, str) and 0 < len(value) <= 255
            and re.fullmatch(r"[a-zA-Z0-9_][a-zA-Z0-9_./-]*", value)
            and ".." not in value and not value.endswith(".")
            and all(part and not part.startswith(".") and not part.endswith(".lock")
                    for part in value.split("/"))
            and value != "HEAD")


def load_config():
    try:
        if CONFIG_FILE.stat().st_size > 128 * 1024:
            raise ValueError("configuration too large")
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict):
            raise ValueError("invalid configuration")
        result = {}
        for key in ("development", "cherryPick"):
            items = data[key]
            if not isinstance(items, list) or len(items) > MAX_BRANCHES or (key == "development" and not items):
                raise ValueError("invalid options")
            seen_ids, seen_refs = set(), set()
            result[key] = []
            for item in items:
                branch_id, label, ref = item["id"], item["label"], item["ref"]
                if (not isinstance(branch_id, str) or not ID_PATTERN.fullmatch(branch_id)
                        or not isinstance(label, str) or not label.strip() or len(label) > 100
                        or not valid_branch_ref(ref)
                        or branch_id in seen_ids or ref in seen_refs):
                    raise ValueError("invalid branch")
                seen_ids.add(branch_id)
                seen_refs.add(ref)
                result[key].append({"id": branch_id, "label": label.strip(), "ref": ref})
        return result
    except (OSError, ValueError, TypeError, KeyError, UnicodeError):
        # Do not return filesystem paths, configuration values or parse errors.
        raise HTTPException(503, "分支配置尚未就绪，请联系管理员。")


def public_options(config):
    return {key: [{"id": item["id"], "label": item["label"]} for item in items]
            for key, items in config.items()}


@router.get("/api/branches")
def branches(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return public_options(load_config())


def resolve_targets(development_id, cherry_ids):
    if (not isinstance(development_id, str) or not ID_PATTERN.fullmatch(development_id)
            or not isinstance(cherry_ids, list) or len(cherry_ids) > MAX_BRANCHES
            or any(not isinstance(item, str) or not ID_PATTERN.fullmatch(item) for item in cherry_ids)
            or len(set(cherry_ids)) != len(cherry_ids)):
        raise HTTPException(400, "分支选择无效，请刷新后重新选择。")
    config = load_config()
    dev = {item["id"]: item for item in config["development"]}.get(development_id)
    available = {item["id"]: item for item in config["cherryPick"]}
    if dev is None or any(item not in available for item in cherry_ids):
        raise HTTPException(400, "存在不允许的目标分支，请刷新后重新选择。")
    cherry = [available[item] for item in cherry_ids]
    if any(item["ref"] == dev["ref"] for item in cherry):
        raise HTTPException(400, "Cherry-pick 目标不能包含开发分支。")
    # Snapshot actual refs at submission, so remapping an alias later does not
    # silently change the task. Future execution must recheck the allowlist.
    return {"development": dev, "cherryPick": cherry}
