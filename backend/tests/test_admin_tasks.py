import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI, Response

import admin_tasks as tasks
from admin_auth import require_admin


class AdminTaskTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name) / "uploads"
        self.override = patch.object(tasks, "UPLOAD_DIR", self.root)
        self.override.start()
        self.addCleanup(self.override.stop)

    def write_task(self, task_id, created=None):
        folder = self.root / task_id
        folder.mkdir(parents=True)
        (folder / "change.patch").write_bytes(b"patch")
        data = {"id": task_id, "filename": "example.patch", "size": 5,
                "commitMessage": "feat: test\n\nsecond line", "status": "received"}
        if created is not None:
            data["createdAt"] = created
        (folder / "request.json").write_text(json.dumps(data), encoding="utf-8")
        return folder

    def test_empty_and_auth_dependency(self):
        self.assertEqual(tasks.list_tasks(Response(), 0, 20)["total"], 0)
        app = FastAPI()
        app.include_router(tasks.router)
        route = next(route for route in app.routes if route.path == "/api/admin/tasks")
        self.assertTrue(any(item.call is require_admin for item in route.dependant.dependencies))

    def test_sorted_paginated_and_historical(self):
        self.write_task("a" * 32, "2024-01-01T00:00:00+00:00")
        self.write_task("b" * 32, "2024-02-01T00:00:00+00:00")
        response = Response()
        page = tasks.list_tasks(response, 0, 1)
        self.assertEqual(page["total"], 2)
        self.assertEqual(page["items"][0]["id"], "b" * 32)
        self.assertEqual(response.headers["cache-control"], "no-store")
        second = tasks.list_tasks(Response(), 1, 1)["items"][0]
        self.assertEqual(second["id"], "a" * 32)
        self.assertEqual(second["commitMessage"], "feat: test\n\nsecond line")
        legacy = self.write_task("c" * 32)
        self.assertEqual(tasks.read_task(legacy)["timeSource"], "metadata_mtime")

    def test_corrupt_and_incomplete_records(self):
        folder = self.write_task("a" * 32)
        (folder / "request.json").write_text("{", encoding="utf-8")
        (self.root / ("b" * 32)).mkdir()
        good = self.write_task("c" * 32)
        result = tasks.list_tasks(Response(), 0, 20)
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["items"][0]["id"], good.name)


if __name__ == "__main__":
    unittest.main()
