import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, Response
import branch_config as branches
import admin_tasks as tasks


class BranchConfigTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.config = self.root / "branches.json"
        override = patch.object(branches, "CONFIG_FILE", self.config)
        override.start()
        self.addCleanup(override.stop)
        override = patch.object(tasks, "UPLOAD_DIR", self.root / "uploads")
        override.start()
        self.addCleanup(override.stop)
        self.data = {
            "development": [{"id": "dev", "label": "Development", "ref": "demo/develop"}],
            "cherryPick": [{"id": "rel", "label": "Release", "ref": "demo/release"},
                           {"id": "same", "label": "Same", "ref": "demo/develop"}],
        }

    def write_config(self):
        self.config.write_text(json.dumps(self.data), encoding="utf-8")

    def test_missing_and_private_options(self):
        with self.assertRaises(HTTPException) as error:
            branches.load_config()
        self.assertEqual(error.exception.status_code, 503)
        self.write_config()
        public = branches.branches(Response())
        self.assertNotIn("ref", public["development"][0])
        self.assertNotIn("demo/develop", json.dumps(public))

    def test_valid_and_invalid_targets(self):
        self.write_config()
        target = branches.resolve_targets("dev", ["rel"])
        self.assertEqual(target["development"]["ref"], "demo/develop")
        self.assertEqual(branches.resolve_targets("dev", [])["cherryPick"], [])
        for development, cherry in [("missing", []), ("dev", ["missing"]), ("dev", ["rel", "rel"]), ("dev", ["same"])]:
            with self.assertRaises(HTTPException) as error:
                branches.resolve_targets(development, cherry)
            self.assertEqual(error.exception.status_code, 400)

    def test_review_preserves_private_snapshot(self):
        self.write_config()
        snapshot = branches.resolve_targets("dev", ["rel"])
        folder = tasks.UPLOAD_DIR / ("a" * 32)
        folder.mkdir(parents=True)
        (folder / "change.patch").write_bytes(b"patch")
        data = {"id": folder.name, "filename": "example.patch", "size": 5,
                "commitMessage": "test", "status": "pending_review", "branchTargets": snapshot}
        path = folder / "request.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        result = tasks.review_task(folder.name, tasks.ReviewRequest(decision="approved"), Response())
        self.assertNotIn("ref", result["targets"]["development"])
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["branchTargets"], snapshot)


if __name__ == "__main__":
    unittest.main()
