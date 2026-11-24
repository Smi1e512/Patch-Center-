import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials

import admin_auth as auth


class AdminAuthTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.override = patch.object(auth, "AUTH_FILE", Path(self.folder.name) / "admin.json")
        self.override.start()
        self.addCleanup(self.override.stop)
        auth.ATTEMPTS.clear()
        self.addCleanup(auth.ATTEMPTS.clear)

    def login(self, password="test-password-123"):
        return auth.login(auth.LoginRequest(password=password), Response())["token"]

    def credentials(self, token):
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_unconfigured_and_invalid(self):
        with self.assertRaises(HTTPException) as error:
            self.login()
        self.assertEqual(error.exception.status_code, 503)
        auth.set_password("test-password-123")
        with self.assertRaises(HTTPException) as error:
            self.login("wrong")
        self.assertEqual(error.exception.status_code, 401)
        with self.assertRaises(HTTPException) as error:
            auth.require_admin(None)
        self.assertEqual(error.exception.status_code, 401)

    def test_persistent_token_and_logout(self):
        auth.set_password("test-password-123")
        token = self.login()
        self.assertNotIn(token, auth.AUTH_FILE.read_text(encoding="utf-8"))
        self.assertNotIn("test-password-123", auth.AUTH_FILE.read_text(encoding="utf-8"))
        self.assertEqual(auth.require_admin(self.credentials(token)), token)
        auth.logout(Response(), token)
        with self.assertRaises(HTTPException) as error:
            auth.require_admin(self.credentials(token))
        self.assertEqual(error.exception.status_code, 401)

    def test_reset_revokes_all_tokens(self):
        auth.set_password("test-password-123")
        token = self.login()
        auth.set_password("replacement-password")
        with self.assertRaises(HTTPException) as error:
            auth.require_admin(self.credentials(token))
        self.assertEqual(error.exception.status_code, 401)
        self.login("replacement-password")

    def test_rate_limit(self):
        auth.set_password("test-password-123")
        for _ in range(auth.MAX_ATTEMPTS):
            with self.assertRaises(HTTPException) as error:
                self.login("wrong")
            self.assertEqual(error.exception.status_code, 401)
        with self.assertRaises(HTTPException) as error:
            self.login()
        self.assertEqual(error.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
