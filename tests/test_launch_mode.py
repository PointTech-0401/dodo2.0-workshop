"""兩堂分開啟動：start-w1.bat 帶 --workshop 1，start-w2.bat 帶 --workshop 2。

第二堂換一個埠，瀏覽器就把它當成另一個網站，localStorage 各存各的，第一堂留下的東西
跑不進第二堂。沒帶 --workshop 是講師或開發者自己跑，兩堂都開，跟以前一樣。
"""

from __future__ import annotations

import sys
from typing import Any

import pytest

import app
import dodo_workshop.web as web_module


def _launched(monkeypatch: pytest.MonkeyPatch, *argv: str) -> dict[str, Any]:
    """照這些參數跑 app.py 的 main()，回傳它交給 run_server 的東西。伺服器不會真的啟動。"""

    seen: dict[str, Any] = {}
    monkeypatch.setattr(web_module, "run_server", lambda **kwargs: seen.update(kwargs))
    monkeypatch.setattr(sys, "argv", ["app.py", *argv])
    app.main()
    return seen


@pytest.mark.parametrize(
    ("argv", "port", "workshop"),
    [
        ((), 8000, None),
        (("serve",), 8000, None),
        (("serve", "--workshop", "1"), 8000, 1),
        (("serve", "--workshop", "2"), 8001, 2),
        (("serve", "--workshop", "2", "--port", "8765"), 8765, 2),
        (("init", "--workshop", "2"), 8001, 2),
    ],
)
def test_session_two_gets_its_own_port_unless_one_is_given(
    monkeypatch: pytest.MonkeyPatch, argv: tuple[str, ...], port: int, workshop: int | None
) -> None:
    launched = _launched(monkeypatch, *argv)

    assert (launched["port"], launched["workshop"]) == (port, workshop)


def test_allow_voice_is_off_unless_asked_for(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _launched(monkeypatch, "serve", "--workshop", "2")["allow_voice"] is False
    assert _launched(monkeypatch, "serve", "--workshop", "2", "--allow-voice")["allow_voice"] is True


def test_there_are_only_two_sessions(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(SystemExit):
        _launched(monkeypatch, "serve", "--workshop", "3")


def test_a_server_nobody_launched_with_a_mode_opens_both_sessions() -> None:
    """測試與 TestClient 直接 import web.py，沒經過 run_server，要跟以前一樣。"""

    data = web_module.bootstrap()

    assert data["workshop_mode"] is None
    assert data["allow_voice"] is True


@pytest.mark.parametrize(
    ("workshop", "allow_voice", "expected"),
    [
        (None, False, {"workshop_mode": None, "allow_voice": True}),
        (1, False, {"workshop_mode": 1, "allow_voice": True}),
        (2, False, {"workshop_mode": 2, "allow_voice": False}),
        (2, True, {"workshop_mode": 2, "allow_voice": True}),
    ],
)
def test_bootstrap_reports_how_the_server_was_launched(
    monkeypatch: pytest.MonkeyPatch, workshop: int | None, allow_voice: bool, expected: dict[str, Any]
) -> None:
    """只有第二堂鎖成打字／文字；--allow-voice 是講師機接喇叭用的。"""

    import uvicorn

    # Set to their own values so monkeypatch puts them back after the test.
    monkeypatch.setattr(web_module, "_workshop_mode", web_module._workshop_mode)
    monkeypatch.setattr(web_module, "_allow_voice", web_module._allow_voice)
    monkeypatch.setattr(uvicorn, "run", lambda *args, **kwargs: None)

    web_module.run_server("127.0.0.1", 8001, open_browser=False, workshop=workshop, allow_voice=allow_voice)

    data = web_module.bootstrap()
    assert {key: data[key] for key in expected} == expected
