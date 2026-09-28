"""门面密钥：默认 /api 与 /demo 必须带头。--no-facade-token 关闭。"""
import os
import unittest
from contextlib import contextmanager

from flask import Flask

from backend.platform.facade_guard import (
    HEADER,
    ensure_facade_token,
    register_facade_guard,
)

_KEYS = ("INFORADAR_FACADE_TOKEN",)


@contextmanager
def facade_env(**kwargs):
    old = {key: os.environ.get(key) for key in _KEYS}
    for key in _KEYS:
        os.environ.pop(key, None)
    for key, value in kwargs.items():
        if value is not None:
            os.environ[key] = value
    try:
        yield
    finally:
        for key, value in old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class _Host:
    def __init__(self):
        self.app = Flask(__name__)


def _client(token=None, *, no_facade_token=False):
    host = _Host()
    hit = {"n": 0}

    @host.app.post("/api/analyze")
    def analyze():
        hit["n"] += 1
        return {"success": True}

    @host.app.get("/api/health")
    def health():
        return {"ok": True}

    @host.app.get("/demo/x")
    def demo():
        return {"ok": True}

    @host.app.get("/client/index.html")
    def page():
        return {"ok": True}

    with facade_env(INFORADAR_FACADE_TOKEN=token):
        register_facade_guard(host, no_facade_token=no_facade_token)
    return host.app.test_client(), hit


class FacadeGuardTest(unittest.TestCase):
    def test_no_facade_token_allows_analyze(self):
        client, hit = _client(no_facade_token=True)
        res = client.post("/api/analyze", json={"text": "hi"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(hit["n"], 1)

    def test_missing_header_does_not_run(self):
        client, hit = _client("facade-secret")
        res = client.post("/api/analyze", json={"text": "hi"})
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.get_json()["success"], False)
        self.assertNotIn("facade-secret", res.get_data(as_text=True))
        self.assertEqual(hit["n"], 0)

    def test_wrong_header_does_not_run(self):
        client, hit = _client("facade-secret")
        res = client.post("/api/analyze", headers={HEADER: "other"})
        self.assertEqual(res.status_code, 403)
        self.assertEqual(hit["n"], 0)

    def test_matching_header_runs(self):
        client, hit = _client("facade-secret")
        res = client.post("/api/analyze", headers={HEADER: "facade-secret"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(hit["n"], 1)

    def test_unset_token_does_not_run(self):
        client, hit = _client(None)
        res = client.post("/api/analyze", json={"text": "hi"})
        self.assertEqual(res.status_code, 403)
        self.assertEqual(hit["n"], 0)

    def test_health_without_header(self):
        client, _hit = _client("facade-secret")
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 403)

    def test_health_with_header(self):
        client, _hit = _client("facade-secret")
        res = client.get("/api/health", headers={HEADER: "facade-secret"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {"ok": True})

    def test_demo_without_header(self):
        client, _hit = _client("facade-secret")
        res = client.get("/demo/x")
        self.assertEqual(res.status_code, 403)

    def test_demo_with_header(self):
        client, _hit = _client("facade-secret")
        res = client.get("/demo/x", headers={HEADER: "facade-secret"})
        self.assertEqual(res.status_code, 200)

    def test_page_without_header(self):
        client, _hit = _client("facade-secret")
        res = client.get("/client/index.html")
        self.assertEqual(res.status_code, 200)

    def test_without_token_exits(self):
        with facade_env():
            with self.assertRaises(SystemExit) as caught:
                ensure_facade_token()
        self.assertEqual(caught.exception.code, 2)

    def test_blank_token_exits(self):
        with facade_env(INFORADAR_FACADE_TOKEN="  "):
            with self.assertRaises(SystemExit) as caught:
                ensure_facade_token()
        self.assertEqual(caught.exception.code, 2)

    def test_with_token_starts(self):
        with facade_env(INFORADAR_FACADE_TOKEN="facade-secret"):
            ensure_facade_token()

    def test_no_facade_token_without_token_starts(self):
        with facade_env():
            ensure_facade_token(no_facade_token=True)


if __name__ == "__main__":
    unittest.main()
