"""源站 /api 与 /demo 默认必须带 X-Facade-Token。

--no-facade-token 关闭校验。页面 / 与 /client 仍公开。
"""
from __future__ import annotations

import hmac
import os
import sys

from flask import request

HEADER = "X-Facade-Token"
ENV_TOKEN = "INFORADAR_FACADE_TOKEN"

_DENIED = {"success": False, "message": "facade token required"}


def facade_token() -> str:
    return os.environ.get(ENV_TOKEN, "").strip()


def ensure_facade_token(*, no_facade_token: bool = False) -> None:
    """缺密钥时拒绝启动。--no-facade-token 时直接返回。"""
    if no_facade_token:
        return
    if not facade_token():
        print(f"error: {ENV_TOKEN} is required", file=sys.stderr)
        sys.exit(2)


def _requires_token(path: str) -> bool:
    return (
        path == "/api"
        or path.startswith("/api/")
        or path == "/demo"
        or path.startswith("/demo/")
    )


def register_facade_guard(connexion_app, *, no_facade_token: bool = False) -> None:
    if no_facade_token:
        return
    expected = facade_token()

    @connexion_app.app.before_request
    def _require_facade_token():  # noqa: ANN202
        path = request.path.rstrip("/") or request.path
        if not _requires_token(path):
            return None
        got = (request.headers.get(HEADER) or "").strip()
        if expected and len(got) == len(expected) and hmac.compare_digest(got, expected):
            return None
        return _DENIED, 403
