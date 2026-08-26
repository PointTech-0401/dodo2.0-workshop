from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field

from dodo_workshop.config import ROOT, load_json
from dodo_workshop.lesson2 import (
    build_proactive_instructions,
    choose_event,
    compose_fallback,
)
from dodo_workshop.llm import TextModel
from dodo_workshop.profile import normalize_workspace, workshop2_starter
from dodo_workshop.weather import get_weather


WEB_DIR = ROOT / "web"
load_dotenv(ROOT / ".env")

app = FastAPI(title="dodo 2.0 Workshop")
app.mount("/assets", StaticFiles(directory=WEB_DIR), name="assets")
_runtime_api_key: str | None = None
_runtime_weather_api_key: str | None = None


def selected_realtime_voice() -> str:
    """Use the same OpenAI voice as the main dodo project."""

    return os.getenv("OPENAI_REALTIME_VOICE", "sage")


def active_api_key() -> str | None:
    return _runtime_api_key or os.getenv("OPENAI_API_KEY")


def active_weather_api_key() -> str | None:
    return _runtime_weather_api_key or os.getenv("WEATHER_API_KEY")


def validate_api_key(api_key: str) -> None:
    OpenAI(api_key=api_key).models.list()


async def validate_weather_api_key(api_key: str) -> None:
    await get_weather("Taipei", api_key)


class ChatRequest(BaseModel):
    message: str
    event: str = "normal"
    workspace: dict[str, Any] | None = None


class RealtimeCheckRequest(BaseModel):
    realtime: dict[str, Any]
    max_output_tokens: int


class ApiKeyRequest(BaseModel):
    api_key: str


class ProactiveCheckRequest(BaseModel):
    policy: dict[str, Any]


class WeatherRequest(BaseModel):
    city: str = Field(min_length=1, max_length=100)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/bootstrap")
def bootstrap() -> dict[str, Any]:
    api_key = active_api_key()
    return {
        "default_workspace": normalize_workspace(None),
        "workshop2_starter": workshop2_starter(),
        "memory_cards": load_json("scenarios/memory_cards.json"),
        "proactive_scenarios": load_json("scenarios/proactive_scenarios.json"),
        "api_configured": bool(api_key),
        "api_key_source": "session" if _runtime_api_key else ("environment" if api_key else None),
        "realtime_model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2"),
        "realtime_voice": selected_realtime_voice(),
        "weather_configured": bool(active_weather_api_key()),
        "weather_key_source": (
            "session"
            if _runtime_weather_api_key
            else ("environment" if active_weather_api_key() else None)
        ),
    }


@app.post("/api/settings/api-key")
def configure_api_key(payload: ApiKeyRequest) -> dict[str, Any]:
    global _runtime_api_key
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="請輸入 OpenAI API Key。")
    try:
        validate_api_key(api_key)
    except Exception as exc:
        status_code = getattr(exc, "status_code", None)
        if status_code in {401, 403}:
            detail = "API Key 無效或沒有權限。"
        else:
            detail = "無法連接 OpenAI API，請檢查網路後再試一次。"
        raise HTTPException(status_code=400, detail=detail) from exc
    _runtime_api_key = api_key
    return {
        "configured": True,
        "source": "session",
        "realtime_model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2"),
        "realtime_voice": selected_realtime_voice(),
        "weather_configured": bool(active_weather_api_key()),
    }


@app.post("/api/settings/api-key/test")
def test_api_key(payload: ApiKeyRequest) -> dict[str, Any]:
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="請輸入 OpenAI API Key。")
    try:
        validate_api_key(api_key)
    except Exception as exc:
        status_code = getattr(exc, "status_code", None)
        detail = (
            "API Key 無效或沒有權限。"
            if status_code in {401, 403}
            else "無法連接 OpenAI API，請檢查網路後再試一次。"
        )
        raise HTTPException(status_code=400, detail=detail) from exc
    return {"valid": True}


async def _check_weather_api_key(api_key: str) -> None:
    if not api_key:
        raise HTTPException(status_code=400, detail="請輸入天氣 API Key。")
    try:
        await validate_weather_api_key(api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail="無法連接天氣服務，請檢查網路後再試一次。",
        ) from exc


@app.post("/api/settings/weather-api-key/test")
async def test_weather_api_key(payload: ApiKeyRequest) -> dict[str, Any]:
    api_key = payload.api_key.strip()
    await _check_weather_api_key(api_key)
    return {"valid": True}


@app.post("/api/settings/weather-api-key")
async def configure_weather_api_key(payload: ApiKeyRequest) -> dict[str, Any]:
    global _runtime_weather_api_key
    api_key = payload.api_key.strip()
    await _check_weather_api_key(api_key)
    _runtime_weather_api_key = api_key
    return {"configured": True, "source": "session"}


@app.post("/api/turn-check")
def turn_check(payload: RealtimeCheckRequest) -> dict[str, Any]:
    turn = payload.realtime.get("turn_detection", {})
    mode = turn.get("type", "semantic_vad")
    silence_ms = int(turn.get("silence_duration_ms", 800))
    eagerness = turn.get("eagerness", "auto")
    if mode == "server_vad":
        mid_pause_passed = silence_ms > 300
        finish_passed = silence_ms <= 1500
        finish_detail = f"server_vad 會在約 {silence_ms} ms 靜音後切回合。"
    elif mode == "semantic_vad":
        mid_pause_passed = eagerness in {"low", "auto", "medium"}
        finish_passed = eagerness in {"low", "auto", "medium", "high"}
        finish_detail = f"semantic_vad 依語意判斷，eagerness={eagerness}。"
    else:
        mid_pause_passed = True
        finish_passed = True
        finish_detail = "push-to-talk 只有放開按鈕才提交回合。"

    checks = [
        {
            "name": "文字輸入不套用 VAD",
            "detail": "按下送出會建立 Realtime 文字回合；停頓設定只屬於語音輸入層。",
            "passed": True,
        },
        {
            "name": "300 ms 中途停頓不搶答",
            "detail": "此項是設定預演；真實結果仍需用麥克風驗證。",
            "passed": mid_pause_passed,
        },
        {
            "name": "完成發言後能提交回合",
            "detail": finish_detail,
            "passed": finish_passed,
        },
        {
            "name": "插話會中止目前回覆",
            "detail": "由 Realtime interrupt_response／response.cancel 控制，不是 Prompt。",
            "passed": bool(turn.get("interrupt_response", True)),
        },
        {
            "name": "輸出上限使用 API 參數",
            "detail": f"max_output_tokens={payload.max_output_tokens}，這是 token 上限，不是句數保證。",
            "passed": 32 <= payload.max_output_tokens <= 1024,
        },
    ]
    return {"checks": checks, "passed": all(item["passed"] for item in checks), "mode": mode}


@app.post("/api/proactive-check")
def proactive_check(payload: ProactiveCheckRequest) -> dict[str, Any]:
    policy = payload.policy
    scenarios = load_json("scenarios/proactive_scenarios.json")
    results = []
    for scenario in scenarios:
        decision = choose_event(scenario, policy)
        expected = scenario.get("expected", {})
        selected_type = decision.event.get("type") if decision.event else None
        passed = (
            decision.should_speak == expected.get("should_speak")
            and (not decision.should_speak or selected_type == expected.get("event_type"))
        )
        results.append(
            {
                "name": scenario["name"],
                "should_speak": decision.should_speak,
                "reason": decision.reason,
                "event_type": selected_type,
                "passed": passed,
            }
        )
    return {"results": results, "passed": all(item["passed"] for item in results)}


@app.post("/api/proactive-message")
def proactive_message(payload: ChatRequest) -> dict[str, str]:
    workspace = normalize_workspace(payload.workspace)
    profile = workspace["profile"]["elder_profile"]
    policy = workspace["profile"]["proactive_policy"]
    event = {"type": payload.event, "topic": payload.message}
    model = TextModel(offline=not bool(os.getenv("OPENAI_API_KEY")))
    reply = model.generate(
        build_proactive_instructions(profile, policy),
        f"事件資料：{event}",
        compose_fallback(event, profile),
    )
    return {"reply": reply}


@app.post("/api/tools/weather")
async def weather_tool(payload: WeatherRequest) -> dict[str, Any]:
    api_key = (active_weather_api_key() or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="尚未設定天氣 API Key，請從右上角「API 設定」完成設定。",
        )
    try:
        return await get_weather(payload.city, api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="天氣服務暫時無法連線，請稍後再試。") from exc


@app.post("/api/realtime/session")
async def realtime_session(request: Request) -> Response:
    api_key = active_api_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="尚未設定 OPENAI_API_KEY，請先完成 API 設定。")

    sdp = (await request.body()).decode("utf-8")
    if not sdp.strip():
        raise HTTPException(status_code=400, detail="缺少 WebRTC SDP。")
    output_mode = request.headers.get("X-Dodo-Output-Mode", "text")
    if output_mode not in {"text", "voice"}:
        raise HTTPException(status_code=400, detail="不支援的輸出方式。")

    session = {
        "type": "realtime",
        "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2"),
        "reasoning": {"effort": "low"},
        "audio": {
            "input": {
                "noise_reduction": {"type": "near_field"},
                "transcription": {
                    "model": "gpt-4o-transcribe",
                    "language": "zh",
                    "prompt": "請使用臺灣繁體中文記錄逐字稿，採用臺灣慣用詞，不要使用簡體字。",
                },
            },
            "output": {"voice": selected_realtime_voice(), "speed": 0.82},
        },
        "output_modalities": ["audio" if output_mode == "voice" else "text"],
    }
    files = {
        "sdp": (None, sdp, "application/sdp"),
        "session": (None, json.dumps(session), "application/json"),
    }
    async with httpx.AsyncClient(timeout=30) as client:
        upstream = await client.post(
            "https://api.openai.com/v1/realtime/calls",
            headers={"Authorization": f"Bearer {api_key}"},
            files=files,
        )
    if upstream.is_error:
        try:
            detail = upstream.json()
        except json.JSONDecodeError:
            detail = upstream.text
        return JSONResponse(status_code=upstream.status_code, content={"detail": detail})
    return Response(content=upstream.text, media_type="application/sdp")


def run_server(host: str, port: int, open_browser: bool, init: bool = False) -> None:
    import threading
    import webbrowser

    import uvicorn

    url = f"http://{host}:{port}/" + ("?init=1" if init else "")
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    print(f"dodo 2.0 Workshop 已啟動：{url}")
    uvicorn.run(app, host=host, port=port, log_level="warning")
