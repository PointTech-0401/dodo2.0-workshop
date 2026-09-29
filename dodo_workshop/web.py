from __future__ import annotations

import json
import os
import re
from datetime import date
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field

from dodo_workshop.config import ROOT, load_json
from dodo_workshop.intake import completeness, missing_reminders
from dodo_workshop.llm import TextModel
from dodo_workshop.proactive import (
    EVENT_TYPES,
    RULE_LABELS,
    Schedule,
    Window,
    build_day,
    build_schedule,
    choose_event,
    simulate_day,
)
from dodo_workshop.profile import (
    REALTIME_VOICES,
    normalize_workspace,
    resolve_voice,
    workshop2_starter,
)
from dodo_workshop.weather import get_weather


WEB_DIR = ROOT / "web"
INTERVIEW_PATH = ROOT / "scenarios" / "interview.md"
# The answer key is server-side by default: 建檔 is the exercise, so the browser
# gets the interview, the expected counts and the results, not the filled form.
# `/api/reference-intake` is the one deliberate exception — an opt-out for people
# who came for the second half and do not want to spend 35 minutes typing.
REFERENCE = load_json("scenarios/reference_profile.json")
load_dotenv(ROOT / ".env")

# Pinning the STT language stops the transcriber from free-guessing and
# translating short Mandarin utterances into English — the same reason the main
# dodo project pins `language` + a zh-Hant prompt at mint time.
STT_TRANSCRIPTION_PROMPT = (
    "請使用臺灣繁體中文記錄逐字稿，採用臺灣慣用詞，不要使用簡體字。"
)
HHMM = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
# What the production orchestrator hard-codes today (dodo spec §7.2): a fixed
# do-not-disturb window that only medication crosses, and meal windows. The
# comparison toggle runs the student's rules against this instead of her 作息.
DODO_FIXED_SCHEDULE = Schedule(
    quiet=Window("固定勿擾 22:00–08:00", 22 * 60, 8 * 60),
    dnd=(Window("用餐 11:00–12:00", 11 * 60, 12 * 60), Window("用餐 17:00–18:00", 17 * 60, 18 * 60)),
    wake=8 * 60,
)
SUMMARY_INSTRUCTIONS = (
    "你是照護系統的摘要器。把下面{address}與豆豆今天的對話整理成一到兩句「跨日摘要」（記憶 C 層）："
    "只寫值得下次接著聊的趨勢、心情或身體狀況的變化；不寫密碼、帳號、第三人的健康、對家人或員工的評價；"
    "不加標題與條列，直接輸出句子，用臺灣繁體中文。"
)

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


class RealtimeSessionRequest(BaseModel):
    """Mint-time Realtime session config.

    `instructions` travels with the SDP offer instead of arriving in a later
    `session.update`, so the very first turn already speaks as 豆豆. This is the
    same contract as the main dodo project (everything in the mint call, no
    session.update round-trip at connect).
    """

    sdp: str = Field(min_length=1)
    output_mode: Literal["text", "voice"] = "text"
    instructions: str = ""
    # `None` disables VAD entirely (push-to-talk). The key is always sent so
    # OpenAI never falls back to its default server_vad + auto create_response.
    turn_detection: dict[str, Any] | None = None
    tools: list[dict[str, Any]] = Field(default_factory=list)
    # A voice cannot be swapped mid-session once the model has produced audio,
    # so the chosen voice has to be baked in here at mint time.
    voice: str = ""


class ApiKeyRequest(BaseModel):
    api_key: str


class ProactiveScenario(BaseModel):
    """One moment, described by hand in the trigger tab.

    The defaults are 「很久沒講話、今天還沒講過、她沒拒絕」, so a half-filled form
    still decides something. `type` stays a plain `str` rather than a `Literal` on
    purpose: `EVENT_TYPES` in `proactive.py` is its only authority, and an unknown
    value should reach the student as the Chinese 400 below, not a pydantic 422.
    """

    time: str = "12:00"
    type: str = "chat"
    minutes_since_last: int = Field(default=24 * 60, ge=0)
    sent_today: int = Field(default=0, ge=0)
    user_declined: bool = False


class ProactiveDecideRequest(BaseModel):
    """One situation, decided by the same rules the simulated day uses.

    The browser sends the student's 建檔 so the quiet and do-not-disturb windows
    come from her 作息; `weekday` defaults to today because this is the real clock.
    """

    policy: dict[str, Any]
    scenario: ProactiveScenario = Field(default_factory=ProactiveScenario)
    elder_profile: dict[str, Any] = Field(default_factory=dict)
    weekday: int | None = Field(default=None, ge=1, le=7)


class DaySimulationRequest(BaseModel):
    """Replay one day through the student's two knobs.

    `events_from="reference"` is the shared story: the whole class runs the same
    星期二 grown from the reference 建檔, so the instructor can narrate one result.
    The student's own 建檔 still matters twice — it supplies the schedule
    (`gates="routines"`), and the reminders it lacks are listed back as consequences.
    """

    policy: dict[str, Any]
    elder_profile: dict[str, Any] = Field(default_factory=dict)
    memory: dict[str, Any] = Field(default_factory=dict)
    events_from: Literal["reference", "mine"] = "reference"
    gates: Literal["routines", "reference", "dodo_fixed"] = "routines"
    weekday: int | None = Field(default=None, ge=1, le=7)


class IntakeCheckRequest(BaseModel):
    elder_profile: dict[str, Any] = Field(default_factory=dict)
    memory: dict[str, Any] = Field(default_factory=dict)


class TranscriptLine(BaseModel):
    role: Literal["user", "dodo"]
    text: str = Field(min_length=1, max_length=2000)


class DaySummaryRequest(BaseModel):
    """Today's conversation → one or two sentences for Layer C. Needs a key."""

    address: str = "長者"
    transcript: list[TranscriptLine] = Field(min_length=1, max_length=200)


class WeatherRequest(BaseModel):
    city: str = Field(min_length=1, max_length=100)


class WorkspaceRequest(BaseModel):
    """A stored or imported 我的 Dodo, in whatever schema it was saved."""

    workspace: dict[str, Any]


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/bootstrap")
def bootstrap() -> dict[str, Any]:
    api_key = active_api_key()
    return {
        "default_workspace": normalize_workspace(None),
        "workshop2_starter": workshop2_starter(),
        "interview_markdown": INTERVIEW_PATH.read_text(encoding="utf-8"),
        "simulated_weekday": REFERENCE["simulated_weekday"],
        "completeness_expected": REFERENCE["expected_counts"],
        "event_types": EVENT_TYPES,
        "rule_labels": RULE_LABELS,
        "api_configured": bool(api_key),
        "api_key_source": "session" if _runtime_api_key else ("environment" if api_key else None),
        "realtime_model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2"),
        "realtime_voice": selected_realtime_voice(),
        "realtime_voices": list(REALTIME_VOICES),
        "weather_configured": bool(active_weather_api_key()),
        "weather_key_source": (
            "session"
            if _runtime_weather_api_key
            else ("environment" if active_weather_api_key() else None)
        ),
    }


@app.post("/api/workspace/normalize")
def normalize_workspace_endpoint(payload: WorkspaceRequest) -> dict[str, Any]:
    """One migration path, not two.

    The browser used to re-implement schema fixes in JavaScript for localStorage
    hydration and for 匯入 — the drift class the golden fixture exists to kill.
    The page is served by this process, so there is no offline hydration case:
    the browser posts whatever it has and stores what comes back.
    """

    try:
        return {"workspace": normalize_workspace(payload.workspace)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


# ---------------------------------------------------------------------------
# Workshop 2: 建檔 → 她的一天 → 真的開口
# ---------------------------------------------------------------------------


def _weekday_or_today(weekday: int | None) -> int:
    return weekday or date.today().isoweekday()


def _schedule_for(payload: DaySimulationRequest, weekday: int) -> Schedule:
    if payload.gates == "dodo_fixed":
        return DODO_FIXED_SCHEDULE
    if payload.gates == "reference":
        return build_schedule(REFERENCE["elder_profile"], weekday)
    return build_schedule(payload.elder_profile, weekday)


def _window_json(window: Window | None) -> dict[str, Any] | None:
    return None if window is None else {"label": window.label, "start": window.start, "end": window.end}


@app.post("/api/proactive-decide")
def proactive_decide(payload: ProactiveDecideRequest) -> dict[str, Any]:
    """Decide a single, student-described situation with the classroom rules.

    Returns the decision only. Wording is the model's job in the live Realtime
    session — keeping the two apart is the whole point of Workshop 2's 實作二.
    """

    scenario = payload.scenario
    if scenario.type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="事件類型只有重要提醒、健康關心、閒聊三種。")
    if not HHMM.match(scenario.time):
        raise HTTPException(status_code=400, detail="時間格式必須是 HH:MM。")
    schedule = build_schedule(payload.elder_profile, _weekday_or_today(payload.weekday))
    try:
        decision = choose_event(scenario.model_dump(), payload.policy, schedule)
    except (KeyError, TypeError, ValueError) as exc:  # `policy` is still a free dict
        raise HTTPException(status_code=400, detail="主動規則不完整，請重新套用設定。") from exc
    return {
        "should_speak": decision.should_speak,
        "rule": decision.rule,
        "reason": decision.reason,
        "type_label": EVENT_TYPES[scenario.type],
    }


@app.post("/api/proactive-simulate")
def proactive_simulate(payload: DaySimulationRequest) -> dict[str, Any]:
    """One day, the student's two knobs, two numbers that pull against each other."""

    weekday = payload.weekday or int(REFERENCE["simulated_weekday"])
    if payload.events_from == "mine":
        feed = build_day(payload.elder_profile, payload.memory, weekday)
    else:
        feed = build_day(REFERENCE["elder_profile"], REFERENCE["memory"], weekday)
    schedule = _schedule_for(payload, weekday)
    try:
        result = simulate_day(feed, payload.policy, schedule)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="主動規則不完整，請重新套用設定。") from exc
    return {
        **result,
        "weekday": weekday,
        "events_from": payload.events_from,
        "gates": payload.gates,
        "schedule": {"quiet": _window_json(schedule.quiet), "dnd": [_window_json(w) for w in schedule.dnd]},
        # Only meaningful against the shared day: what her real care file has that
        # the student's does not — 「參考有 21:00 安眠藥，你的沒有 → 她今晚沒吃藥」.
        "missing_reminders": (
            missing_reminders(payload.elder_profile, REFERENCE["elder_profile"], weekday)
            if payload.events_from == "reference"
            else []
        ),
    }


@app.get("/api/reference-intake")
def reference_intake() -> dict[str, Any]:
    """The filled 建檔, for「直接載入範例」.

    This is the answer key, handed over on purpose: someone who joined for the
    主動 half, or who is falling behind, should be able to skip the typing and
    still have a working 秀蘭阿嬤. It arrives in the form as an unapplied edit —
    the student still presses 套用 — so it goes through exactly the same path a
    typed 建檔 does.
    """

    return {
        "elder_profile": REFERENCE["elder_profile"],
        "memory": {"facts": REFERENCE["memory"]["facts"], "events": REFERENCE["memory"]["events"]},
    }


@app.post("/api/intake-check")
def intake_check(payload: IntakeCheckRequest) -> dict[str, Any]:
    """Counts per section plus the reminders the reference has and this file lacks.

    Deliberately not a grade: whether the content is right is answered by 她的一天
    and by 豆豆's own answers, not by an answer key the student never sees.
    """

    weekday = int(REFERENCE["simulated_weekday"])
    return {
        "completeness": completeness(payload.elder_profile, payload.memory, REFERENCE["expected_counts"]),
        "missing_reminders": missing_reminders(payload.elder_profile, REFERENCE["elder_profile"], weekday),
        "weekday": weekday,
    }


@app.post("/api/day-summary")
def day_summary(payload: DaySummaryRequest) -> dict[str, Any]:
    """Layer C is grown from the conversation, not typed: the one write nobody makes by hand."""

    api_key = active_api_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="尚未設定 OPENAI_API_KEY，無法產生今日摘要。")
    transcript = "\n".join(
        f"{'長者' if line.role == 'user' else '豆豆'}：{line.text.strip()}" for line in payload.transcript
    )
    try:
        summary = TextModel(api_key=api_key).generate(
            SUMMARY_INSTRUCTIONS.format(address=payload.address.strip() or "長者"), transcript
        )
    except RuntimeError as exc:  # offline mode has no fallback for a real summary
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="摘要服務暫時無法連線，請稍後再試。") from exc
    return {"summary": summary}


@app.post("/api/tools/weather")
async def weather_tool(payload: WeatherRequest) -> dict[str, Any]:
    api_key = (active_weather_api_key() or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="尚未設定天氣 API Key，請從右上角「系統設定」完成設定。",
        )
    try:
        return await get_weather(payload.city, api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="天氣服務暫時無法連線，請稍後再試。") from exc


@app.post("/api/realtime/session")
async def realtime_session(payload: RealtimeSessionRequest) -> Response:
    api_key = active_api_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="尚未設定 OPENAI_API_KEY，請先完成系統設定。")

    session: dict[str, Any] = {
        "type": "realtime",
        "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2"),
        "reasoning": {"effort": "low"},
        "audio": {
            "input": {
                "noise_reduction": {"type": "near_field"},
                "transcription": {
                    "model": "gpt-4o-transcribe",
                    "language": "zh",
                    "prompt": STT_TRANSCRIPTION_PROMPT,
                },
                "turn_detection": payload.turn_detection,
            },
            # No `speed`: the main dodo project leaves it at 1.0 and lets the
            # 「個性與聲音」prompt block carry the slower delivery. Setting both
            # would slow the voice twice over.
            "output": {"voice": resolve_voice(payload.voice, selected_realtime_voice())},
        },
        # No `max_output_tokens`: reply length is a Prompt concern, not an API
        # cap — again matching dodo, which sets no ceiling.
        "output_modalities": ["audio" if payload.output_mode == "voice" else "text"],
    }
    if payload.instructions.strip():
        session["instructions"] = payload.instructions
    if payload.tools:
        session["tools"] = payload.tools
        session["tool_choice"] = "auto"

    files = {
        "sdp": (None, payload.sdp, "application/sdp"),
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
