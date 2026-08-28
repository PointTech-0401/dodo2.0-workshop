import asyncio
import json
from pathlib import Path

from dodo_workshop.web import (
    ApiKeyRequest,
    WeatherRequest,
    WEB_DIR,
    active_weather_api_key,
    bootstrap,
    configure_api_key,
    configure_weather_api_key,
    selected_realtime_voice,
    test_api_key as validate_api_key_without_saving,
    test_weather_api_key as validate_weather_api_key_without_saving,
    weather_tool,
)


def test_shared_client_and_bootstrap_are_available() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    data = bootstrap()

    assert "同一個 Dodo，持續升級" in page
    assert "Prompt 與 Realtime 是兩層" in page
    assert "API Key" in page
    assert "用分塊設計回答方式" in page
    assert "完整 System Prompt" in page and "只能檢視" in page
    assert '<pre id="agentSystemPrompt"' in page
    assert '<textarea id="agentSystemPrompt"' not in page
    assert "可編輯的 Prompt 分塊" in page
    # The 聲線 / 回覆長度 fact lines were removed as UI noise; the tools line stays
    # because refreshApiUi writes the weather status into it.
    assert "實際 Realtime 聲線" not in page
    assert "回覆長度不設 API 上限" not in page
    assert 'id="weatherToolStatus"' in page
    assert "realtimeVoiceName" not in page and "realtimeVoiceName" not in script
    assert ".onboarding[hidden] { display: none; }" in styles
    assert data["workshop2_starter"]["progress"]["workshop_1_completed"]


def test_runtime_api_key_is_validated_without_being_returned(monkeypatch) -> None:
    import dodo_workshop.web as web_module

    monkeypatch.setattr(web_module, "validate_api_key", lambda api_key: None)
    monkeypatch.setattr(web_module, "_runtime_api_key", None)

    result = configure_api_key(ApiKeyRequest(api_key="sk-test-secret"))

    assert result["configured"] is True
    assert "api_key" not in result
    assert web_module.active_api_key() == "sk-test-secret"


def test_api_key_must_be_tested_without_being_saved(monkeypatch) -> None:
    import dodo_workshop.web as web_module

    monkeypatch.setattr(web_module, "validate_api_key", lambda api_key: None)
    monkeypatch.setattr(web_module, "_runtime_api_key", None)

    result = validate_api_key_without_saving(ApiKeyRequest(api_key="sk-pending-secret"))

    assert result == {"valid": True}
    assert web_module.active_api_key() is None


def test_runtime_weather_api_key_is_validated_without_being_returned(monkeypatch) -> None:
    import dodo_workshop.web as web_module

    async def fake_validate(api_key: str) -> None:
        assert api_key == "weather-test-secret"

    monkeypatch.delenv("WEATHER_API_KEY", raising=False)
    monkeypatch.setattr(web_module, "validate_weather_api_key", fake_validate)
    monkeypatch.setattr(web_module, "_runtime_weather_api_key", None)

    result = asyncio.run(
        configure_weather_api_key(ApiKeyRequest(api_key="weather-test-secret"))
    )

    assert result == {"configured": True, "source": "session"}
    assert "api_key" not in result
    assert active_weather_api_key() == "weather-test-secret"


def test_weather_api_key_test_does_not_save_key(monkeypatch) -> None:
    import dodo_workshop.web as web_module

    async def fake_validate(api_key: str) -> None:
        assert api_key == "weather-pending-secret"

    monkeypatch.delenv("WEATHER_API_KEY", raising=False)
    monkeypatch.setattr(web_module, "validate_weather_api_key", fake_validate)
    monkeypatch.setattr(web_module, "_runtime_weather_api_key", None)

    result = asyncio.run(
        validate_weather_api_key_without_saving(
            ApiKeyRequest(api_key="weather-pending-secret")
        )
    )

    assert result == {"valid": True}
    assert active_weather_api_key() is None


def test_realtime_voice_matches_dodo_default(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_REALTIME_VOICE", raising=False)

    assert selected_realtime_voice() == "sage"
    assert bootstrap()["realtime_model"] == "gpt-realtime-2"


def test_settings_ui_has_separate_input_output_and_api_actions() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert '>測試</button>' in page
    assert 'id="weatherApiKeyInput" type="password"' in page
    assert 'id="testWeatherApiKey"' in page
    # Each key now has a 測試 button only; saving is owned by the single button at
    # the bottom of the sheet, and the sheet is closable once setup exists.
    assert 'id="saveApiKey"' not in page
    assert 'id="saveWeatherApiKey"' not in page
    assert 'id="saveApiKey"' not in script
    assert 'id="saveWeatherApiKey"' not in script
    assert 'id="closeOnboarding"' in page
    assert 'aria-label="關閉設定"' in page
    assert 'name="inputMode"' in page
    assert 'name="outputMode"' in page
    assert '<textarea id="chatInput"' in page
    assert 'id="voiceConnect"' not in page
    assert "function disconnectRealtime()" in script
    assert "async function connectRealtime()" in script
    assert "await connectRealtime()" in script
    assert "sender.track?.stop()" in script
    assert "setup.mode" not in script
    assert 'fetch("/api/chat"' not in script
    assert 'model: "gpt-4o-transcribe"' in script
    assert "請使用臺灣繁體中文記錄逐字稿" in script
    assert 'noise_reduction: { type: "near_field" }' in script
    assert 'reasoning: { effort: "low" }' in script
    assert 'name: "get_weather"' in script
    assert 'name: "read_memory"' in script
    assert 'name: "update_memory"' in script
    assert "不得保存密碼、API Key" in script
    assert 'type: "function_call_output"' in script
    assert 'fetch("/api/tools/weather"' in script
    assert 'fetch("/api/settings/weather-api-key/test"' in script
    assert 'fetch("/api/settings/weather-api-key"' in script
    assert '$("#apiKeyInput").value = ""' not in script
    assert '$("#weatherApiKeyInput").value = ""' not in script
    assert "prompt_blocks: promptBlocksFromFields()" in script
    assert 'preview.textContent = prompt || EMPTY_PROMPT_NOTICE' in script
    assert '$("#agentSystemPrompt").value' not in script
    assert "即使使用者只說" not in script
    assert "#promptIdentity" in script
    assert "#promptPersonalityTone" in script
    assert "#promptConversationStyle" in script
    assert "#promptLanguage" in script
    assert "#promptSafety" in script
    assert "output_mode: setup.outputMode" in script
    assert 'output_modalities: [setup?.outputMode === "voice" ? "audio" : "text"]' in script
    assert 'window.addEventListener("beforeunload", disconnectRealtime)' in script


def test_persona_rides_along_at_mint_time_and_errors_are_never_swallowed() -> None:
    """Regression guard for the 「豆豆 replies in English」 bug.

    Three defects stacked up: the mint call carried no `instructions`, the
    follow-up session.update carried the beta-era `max_response_output_tokens`
    (which GA rejects, voiding the whole update), and no `error` handler existed
    to surface the rejection. The session therefore ran with OpenAI's default
    persona — English replies, default voice.
    """

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    server = (Path(__file__).resolve().parents[1] / "dodo_workshop" / "web.py").read_text(
        encoding="utf-8"
    )

    # 1. The persona reaches OpenAI with the SDP offer, not only afterwards.
    assert "instructions: realtimeInstructions()" in script
    assert 'session["instructions"] = payload.instructions' in server
    # Built from the blocks, so a stale stored system_prompt can never blank it.
    # Workshop 2 now appends its own sections, so the assembly moved into
    # composeInstructions — still from the blocks, never from the stored string.
    assert "return composeInstructions(workspace);" in script
    assert "buildSystemPrompt(source.profile.agent)" in script
    assert "workspace.profile.agent.system_prompt" not in script

    # 2. No beta-era field name, and no output cap on either payload. Scoped to
    #    the payload builder with comments stripped, so the explanatory notes
    #    naming the removed fields don't match.
    session_update = "\n".join(
        line
        for line in script.split("function realtimeSessionUpdate() {")[1]
        .split("\n}")[0]
        .splitlines()
        if not line.strip().startswith("//")
    )
    assert "max_response_output_tokens" not in session_update
    assert "max_output_tokens" not in session_update
    assert "speed" not in session_update
    assert "max_response_output_tokens" not in server
    assert '"max_output_tokens"' not in server

    # 3. A rejected session.update is surfaced instead of silently ignored.
    assert 'if (event.type === "error")' in script
    assert '[realtime error]' in script

    # 4. Speed stays unset on both paths — dodo leaves it at 1.0 (prompt-driven).
    assert "0.82" not in script
    assert "0.82" not in server
    assert '"speed"' not in server

    # 5. turn_detection is always sent, so push-to-talk really disables VAD
    #    instead of falling back to OpenAI's default server_vad.
    assert '"turn_detection": payload.turn_detection' in server


def test_api_settings_sheet_closes_and_saves_from_one_button() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    # X + Esc, but only once there is a working setup behind the sheet — closing
    # on first run would leave an app with no API key and no way to set one.
    assert "function closeOnboarding()" in script
    assert "function canCloseOnboarding()" in script
    assert 'if (!canCloseOnboarding()) return;' in script
    assert '$("#closeOnboarding").hidden = !canCloseOnboarding();' in script
    assert 'event.key !== "Escape"' in script
    assert 'class="sheet-close"' in page

    # 測試 only validates and reports a boolean; the bottom button commits both.
    assert "async function commitApiKey()" in script
    assert "async function commitWeatherApiKey()" in script
    assert "await commitApiKey()" in script
    assert "await commitWeatherApiKey()" in script
    # An untested key is tested on the way through, so 測試 is never mandatory.
    assert "if (apiKey !== testedApiKey && !(await testApiKey())) return false;" in script
    # Closing discards a tested-but-uncommitted key.
    assert 'testedApiKey = "";\n  testedWeatherApiKey = "";' in script


def test_typing_interrupts_a_reply_in_progress() -> None:
    """`interrupt_response` only covers VAD voice input, so a typed message used
    to queue behind whatever 豆豆 was already saying."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert "function interruptResponse()" in script
    # sendText cancels before it enqueues the new turn.
    send_text = script.split("async function sendText(")[1].split("\n}")[0]
    assert "interruptResponse();" in send_text

    interrupt = script.split("function interruptResponse() {")[1].split("\n}")[0]
    assert '"response.cancel"' in interrupt
    # WebRTC-only, and the SDK requires it to follow response.cancel.
    assert '"output_audio_buffer.clear"' in interrupt
    assert interrupt.index("response.cancel") < interrupt.index("output_audio_buffer.clear")
    # Only meaningful for audio output, and only when something is in flight —
    # an idle cancel draws an error event, which is now surfaced loudly.
    assert 'setup?.outputMode === "voice"' in interrupt
    assert "!isDodoSpeaking()" in interrupt
    # response.cancel is only valid during generation; after response.done it
    # errors, so the two sends are gated separately.
    assert "if (responseActive) dataChannel.send" in interrupt

    # `response.done` means generation finished, NOT that 豆豆 stopped talking —
    # the WebRTC buffer plays on for seconds. Tracking only responseActive is why
    # typed barge-in appeared to do nothing.
    speaking = script.split("function isDodoSpeaking() {")[1].split("\n}")[0]
    assert "responseActive || audioPlaying" in speaking
    assert '"output_audio_buffer.started"' in script
    assert '"output_audio_buffer.stopped"' in script
    assert '"output_audio_buffer.cleared"' in script
    # Fallback for transports that never emit output_audio_buffer.started.
    assert "Boolean(voiceDraft)" in speaking
    # The interrupted bubble is closed off or the next reply appends to it.
    assert "finalizeVoiceDraft();" in interrupt

    # Optimistic set on send, not on the response.created echo, so two quick
    # messages cannot race past the cancel.
    assert "responseActive = true;" in script.split("function sendResponseCreate() {")[1].split("\n}")[0]
    # Push-to-talk's previously unconditional cancel is gated the same way.
    assert "dataChannel?.send(JSON.stringify({ type: \"response.cancel\" }))" not in script
    # Typing while a tool fetch is in flight must not double-fire response.create.
    assert 'if (dataChannel?.readyState === "open" && !responseActive) sendResponseCreate();' in script


def test_tool_status_is_not_rendered_as_dodo_speech() -> None:
    """The weather status lines showed up labelled DODO, so a failed lookup read
    like 豆豆 speaking error text mid-conversation."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert 'tool: "TOOL"' in script
    assert 'system: "SYSTEM"' in script
    assert "SPEAKER_LABELS[role]" in script
    assert ".message.tool" in styles
    assert ".message.system" in styles

    # Only the four voiceDraft renders are real model output. Every other row —
    # 套用 confirmations, connection errors, quiz results — is app text and used
    # to be labelled DODO.
    assistant_rows = [
        line.strip()
        for line in script.splitlines()
        if 'addMessage("assistant"' in line
    ]
    assert len(assistant_rows) == 4, assistant_rows
    assert all("voiceDraft" in row for row in assistant_rows), assistant_rows
    # The hardcoded opening bubble is app text too.
    assert '<article class="message system">' in page
    assert '<span class="speaker">SYSTEM</span>' in page
    # The 套用 message no longer narrates 5 個 Prompt 區塊 at the student.
    assert "已從 5 個 Prompt 區塊重新組裝" not in script
    assert ">套用</button>" in page
    # Every get_weather status row uses the tool role, not assistant.
    weather_branch = (
        script.split('if (call.name !== "get_weather")')[1]
        .split("async function handleRealtimeEvent")[0]
    )
    assert 'addMessage("assistant"' not in weather_branch
    assert weather_branch.count('addMessage("tool"') == 3


def test_message_bubbles_are_half_width_and_wrap_long_text() -> None:
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert ".message { width: fit-content; max-width: 40%;" in styles
    assert "white-space: pre-wrap" in styles
    assert "overflow-wrap: anywhere" in styles
    assert "word-break: break-word" in styles


def test_chat_and_prompt_panels_have_an_accessible_drag_resizer() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert 'id="panelResizer"' in page
    assert 'role="separator"' in page
    assert 'aria-orientation="vertical"' in page
    assert 'tabindex="0"' in page
    # The left LIVE STATE rail is gone, so the grid is chat + resizer + lab.
    assert "grid-template-columns: minmax(360px, 1fr) 10px var(--lab-width)" in styles
    assert "signal-rail" not in styles and "signal-rail" not in page
    assert "LIVE STATE" not in page
    assert "LAB_WIDTH_MAX" not in script
    # 1:1 is the default now, so the ceiling is the chat floor rather than half
    # the shell — a max of half would pin the divider at its starting position.
    assert "max: Math.max(LAB_WIDTH_MIN, usableWidth - minimumChatWidth)" in script
    assert ".signal-rail" not in script
    # Dodo's live state moved into the chat panel, reusing setState's hooks.
    assert 'class="state-bar"' in page
    assert 'data-state="listening"' in page and 'id="connectionNote"' in page
    assert ".panel-resizer {" in styles and "cursor: col-resize" in styles
    assert ".panel-resizer { display: none; }" in styles
    assert "function setLabPanelWidth(width)" in script
    assert "function resizePanelsFromKeyboard(event)" in script
    assert 'addEventListener("pointerdown", startPanelResize)' in script
    assert 'addEventListener("pointermove", movePanelResize)' in script
    assert 'addEventListener("keydown", resizePanelsFromKeyboard)' in script


def test_chat_input_uses_enter_to_send_and_shift_enter_for_newline() -> None:
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert ".composer textarea { flex: 1 1 auto; width: 100%;" in styles
    assert '$("#chatInput").addEventListener("keydown"' in script
    assert 'event.key !== "Enter" || event.shiftKey || event.isComposing' in script
    assert '$("#chatForm").requestSubmit()' in script


def test_right_settings_panel_uses_jhenghei_and_minimum_fourteen_pixel_text() -> None:
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert '.lab-panel, .lab-panel * { font-family: "Microsoft JhengHei"' in styles
    assert ".lab-panel :where(" in styles
    assert "font-size: 14px !important" in styles

def test_weather_tool_uses_configured_legacy_service(monkeypatch) -> None:
    import dodo_workshop.web as web_module

    async def fake_weather(city: str, api_key: str) -> dict:
        assert city == "Taipei"
        assert api_key == "weather-secret"
        return {"city": "Taipei", "temperature_c": 26, "humidity_percent": 70}

    monkeypatch.setenv("WEATHER_API_KEY", "weather-secret")
    monkeypatch.setattr(web_module, "get_weather", fake_weather)

    result = asyncio.run(weather_tool(WeatherRequest(city="Taipei")))

    assert result["temperature_c"] == 26


def test_clearing_a_prompt_block_removes_that_section() -> None:
    """The preview used to ignore an emptied textarea.

    `promptBlocksFromFields` fell back to DEFAULT_PROMPT_BLOCKS on a blank field
    and `buildSystemPrompt` did it a second time, so clearing a block silently
    restored the default and the preview never changed.
    """

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")

    fields = script.split("function promptBlocksFromFields() {")[1].split("\n}")[0]
    assert "DEFAULT_PROMPT_BLOCKS" not in fields

    build = script.split("function buildSystemPrompt(agent) {")[1].split("\n}")[0]
    # Missing key still defaults (legacy files); empty string drops the section.
    assert "key in supplied ? supplied[key] : DEFAULT_PROMPT_BLOCKS[key]" in build
    assert "if (!content) return null;" in build
    assert ".filter(Boolean)" in build

    # An all-empty prompt is legal but must be called out, not shown as blank.
    assert "EMPTY_PROMPT_NOTICE" in script
    assert 'classList.toggle("is-empty"' in script
    assert "清空某個區塊會把整段從 Prompt 移除" in page


def test_settings_dry_run_is_gone_and_apply_marks_workshop_one_done() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    server = (Path(__file__).resolve().parents[1] / "dodo_workshop" / "web.py").read_text(
        encoding="utf-8"
    )

    for stale in ("runTurnTests", "turnResults", "設定預演", "turn-check"):
        assert stale not in page, stale
        assert stale not in script, stale
    assert "turn_check" not in server and "turn-check" not in server

    # The dry run was the only writer of workshop_1_completed; 套用 owns it now.
    apply_fn = script.split("async function applyWorkshop1() {")[1].split("\n}")[0]
    assert "workspace.progress.workshop_1_completed = true;" in apply_fn
    assert "saveProject();" in apply_fn

    # Workshop 2's results list shares .test-item styling, so it must survive.
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    assert ".test-item" in styles and 'id="proactiveResults"' in page


def test_voice_is_part_of_the_project_and_needs_a_reconnect_to_change() -> None:
    """OpenAI forbids swapping the voice on a live session once it has produced
    audio, so 套用 must reconnect rather than rely on session.update."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert 'id="agentVoice"' in page
    assert "function renderVoiceOptions()" in script
    # Voice travels with the project, not from the server env, so it exports too.
    assert "voice: workspace.profile.agent.voice" in script
    assert "voice: selectedVoice()" in script
    assert "bootstrapData.realtime_voice }" not in script

    apply_fn = script.split("async function applyWorkshop1() {")[1].split("\n}")[0]
    assert "previousVoice !== workspace.profile.agent.voice" in apply_fn
    assert "disconnectRealtime();" in apply_fn

    # Only real built-in voices survive validation, on both sides.
    assert 'REALTIME_VOICES.some(([id]) => id === value)' in script
    assert "resolve_voice(payload.voice, selected_realtime_voice())" in (
        (Path(__file__).resolve().parents[1] / "dodo_workshop" / "web.py").read_text(encoding="utf-8")
    )


def test_three_persona_presets_each_have_all_blocks_and_a_distinct_voice() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert 'id="promptPresets"' in page
    assert "function applyPreset(id)" in script
    for preset_id in ("gentle", "neural", "cheer"):
        assert f'id: "{preset_id}"' in script
    for voice in ('voice: "sage"', 'voice: "ash"', 'voice: "coral"'):
        assert voice in script
    # Presets replace the blocks + voice but keep the student's own name/稱呼.
    apply_preset = script.split("function applyPreset(id) {")[1].split("\n}")[0]
    assert "#agentName" not in apply_preset and "#agentAddress" not in apply_preset
    assert '$("#agentVoice").value = preset.voice;' in apply_preset


def test_memory_tools_are_visible_in_the_transcript_like_the_weather_tool() -> None:
    """read_memory/update_memory returned before the TOOL-row code, so students
    could not see 豆豆 reading or writing memory at all."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    tool_fn = script.split("async function executeRealtimeTool(call) {")[1].split(
        "\nasync function handleRealtimeEvent"
    )[0]

    assert 'addMessage("tool", `read_memory' in tool_fn
    assert 'addMessage("tool", `update_memory' in tool_fn
    assert "update_memory 已拒絕" in tool_fn  # sensitive-data refusal is visible too
    assert tool_fn.count('addMessage("tool"') >= 6


def test_remote_audio_is_attached_and_playback_failure_is_reported() -> None:
    """A detached <audio autoplay> is silently blocked by the browser autoplay
    policy on a fresh load, which is why a refresh sometimes had no sound."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert "document.body.append(remoteAudio)" in script
    assert "remoteAudio.playsInline = true" in script
    assert "async function playRemoteAudio()" in script
    assert "await remoteAudio.play()" in script
    # Failure must be surfaced and retried on the next user gesture.
    assert "瀏覽器擋住了自動播放" in script
    assert 'document.addEventListener("click", retryRemoteAudio, { once: true })' in script
    assert "remoteAudio.remove()" in script


def test_interest_label_matches_the_separator_actually_used() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    # The splitter always accepted 、, ， and , — only the label said 逗號.
    assert "興趣（用「、」分隔，逗號也可以）" in page
    assert "興趣（用逗號分隔）" not in page
    assert "split(/[、,，]/)" in script
    assert 'interests.join("、")' in script


def test_every_element_the_client_touches_exists_in_the_page() -> None:
    """A mistyped id fails silently in the browser ($(...) returns null and the
    next property access throws mid-handler), so it is worth checking here."""

    import re

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    declared = set(re.findall(r'id="([A-Za-z0-9_-]+)"', page))
    used = set(re.findall(r'\$\("#([A-Za-z0-9_-]+)"\)', script))
    used |= set(re.findall(r'getElementById\("([A-Za-z0-9_-]+)"\)', script))
    # The two streaming-draft bubbles are created at runtime, not in the page.
    runtime_only = {"voiceDraft", "userVoiceDraft"}

    assert used - declared == runtime_only


def test_refresh_keeps_the_student_on_the_stage_they_were_on() -> None:
    """套用 in Workshop 1 sets `workshop_1_completed`, and the old initialize()
    read that flag to pick the stage — so a plain F5 in Workshop 1 jumped to
    Workshop 2. The stage is now remembered where every entry point funnels."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert 'const STAGE_KEY = "dodo-workshop.stage"' in script
    switch_stage = script.split("function switchStage(stage) {")[1].split("\n}")[0]
    assert 'localStorage.setItem(STAGE_KEY, isFirst ? "1" : "2")' in switch_stage
    assert "function storedStage()" in script
    # Progress survives only as the first-visit default, never as an override.
    assert "const stage = storedStage()" in script
    # Reopening the sheet from 「系統設定」 hides the entry choice, so saving there
    # must not switch (and persist) a stage the student never picked.
    assert "if (!forced) switchStage(startStage);" in script
    assert (
        "if (workspace.progress.workshop_1_completed && !workspace.progress.workshop_2_completed) switchStage(2);"
        not in script
    )


def test_panels_open_at_a_one_to_one_split_and_remember_manual_drags() -> None:
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    # 10px resizer, so half of what is left is `50% - 5px` on both columns.
    assert ".app-shell { --lab-width: calc(50% - 5px);" in styles
    assert "--lab-width: 430px" not in styles
    assert "--lab-width: 340px" not in styles
    # A drag is remembered; the responsive default is never frozen into pixels.
    assert 'const LAB_WIDTH_KEY = "dodo-workshop.labWidth"' in script
    assert "function persistLabPanelWidth()" in script
    assert "function restoreLabPanelWidth()" in script
    stop_resize = script.split("function stopPanelResize(event) {")[1].split("\n}")[0]
    assert "persistLabPanelWidth();" in stop_resize
    clamp = script.split("function clampPanelWidths() {")[1].split("\n}")[0]
    assert "if (!localStorage.getItem(LAB_WIDTH_KEY))" in clamp
    assert "persistLabPanelWidth" not in clamp


def test_preamble_is_separated_from_the_answer_in_the_transcript() -> None:
    """Realtime has no preamble item type: a preamble is a message item sharing a
    response with a function_call, and the answer arrives in the next response."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert "function markPreamble(bubble)" in script
    assert "function markResponseAsPreamble()" in script
    assert "function trackResponseBubble(bubble)" in script
    # Reset per response, so a preamble label never leaks into the next answer.
    assert 'if (event.type === "response.created") startResponseTracking();' in script
    # Marked when the function_call item shows up...
    assert 'event.type === "response.output_item.added" && event.item?.type === "function_call"' in script
    # ...and swept at response.done, because item ordering is not guaranteed.
    assert "if (responseHasFunctionCall(event.response)) markResponseAsPreamble();" in script
    assert "PREAMBLE" in script
    assert ".message.assistant.is-preamble p" in styles
    # Every streamed bubble is tracked, or a late function_call cannot relabel it.
    assert script.count('trackResponseBubble(addMessage("assistant"') == 4
    # The default prompt asks for a preamble, or students would never see one.
    assert "這句開場叫 preamble" in script


def test_workshop2_has_its_own_viewable_editable_prompt_layer() -> None:
    """長者資料、三層記憶 and the proactive rules used to reach the model only if
    it happened to call read_memory — Workshop 2 had no instructions of its own."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    # Editable blocks, plus the same read-only full-prompt VIEW as Workshop 1.
    assert '<textarea id="promptMemoryUse"' in page
    assert '<textarea id="promptProactive"' in page
    assert "完整 System Prompt（Workshop 1 + 2）" in page
    assert '<pre id="workshop2SystemPrompt"' in page
    assert '<textarea id="workshop2SystemPrompt"' not in page
    assert 'id="elderCity"' in page and 'id="maxSentences"' in page
    assert "function buildWorkshop2Prompt(source)" in script
    assert "function rebuildWorkshop2Prompt()" in script
    assert "workshop2_blocks: workshop2BlocksFromFields()" in script
    # The generated sections are what actually carry the Workshop 2 data.
    for section in ("# 長者資料", "# 目前記得的事（三層記憶）", "# 主動訊息的程式規則"):
        assert section in script
    # 套用 sends it into the live session instead of only saving to localStorage.
    apply_two = script.split("async function applyWorkshop2() {")[1].split("\n}")[0]
    assert '"session.update"' in apply_two
    # Bounded: instructions are re-sent on every 套用.
    assert "MEMORY_PREVIEW_LIMIT" in script


def test_memory_classification_drives_storage_and_shows_its_reasoning() -> None:
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")

    # A/B/C picks the list the value lands in, X is refused outright.
    assert 'enum: ["A", "B", "C"]' in script
    assert '["A", "facts", "A 重要事實"]' in script
    assert '["B", "events", "B 近期事件"]' in script
    assert '["C", "summaries", "C 跨日摘要"]' in script
    assert "update_memory 已拒絕（X 不保存）" in script
    # The quiz explains itself now instead of only scoring.
    assert 'id="memoryExplanations"' in page
    assert "card.explanation" in script


def test_one_simulated_day_is_reachable_from_the_client() -> None:
    from dodo_workshop.web import DaySimulationRequest, proactive_simulate

    policy = bootstrap()["workshop2_starter"]["profile"]["proactive_policy"]
    result = proactive_simulate(DaySimulationRequest(policy=policy, gates="reference"))

    assert result["spoken"] + result["blocked"] == len(result["steps"])
    assert (result["missed_health"], result["noise"]) == (1, 2)
    assert result["weekday"] == 2 and result["events_from"] == "reference"
    # No student 建檔 was sent, so both of her medications come back as consequences.
    assert [item["time"] for item in result["missing_reminders"]] == ["07:00", "21:00"]
    # Every step says which rule decided it — the timeline is the lesson.
    assert all(step["reason"] for step in result["steps"])

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert 'id="runDaySimulation"' in page
    assert 'id="dayTimeline"' in page and 'id="daySummary"' in page
    assert 'fetch("/api/proactive-simulate"' in script
    # Two competing numbers, never combined into one grade.
    assert "漏掉重要事" in script and "打擾" in script
    assert "沒有滿分答案" in script
    # A re-run has to say what got better AND what got worse.
    assert "function renderDayDelta(result)" in script
    assert "let lastDayRun = null;" in script
    assert ".day-row.is-blocked" in styles


def test_humans_can_delete_what_the_agent_remembered() -> None:
    """Only the model could write memory and nobody could correct it, which
    contradicted the lesson's own question 「誰能寫入或修改？」"""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert 'id="memoryViewer"' in page
    assert "function renderMemoryViewer()" in script
    assert "function deleteMemoryEntry(layer, index)" in script
    delete_fn = script.split("function deleteMemoryEntry(layer, index) {")[1].split("\n}")[0]
    # Deleting has to reach the live session, or the baked instructions still
    # hold the deleted fact and 「刪除」 looks broken. Shared with the 記憶分類
    # write, which happens outside the conversation for the same reason.
    assert "saveProject();" in delete_fn
    assert "rebuildWorkshop2Prompt();" in delete_fn
    assert "pushMemoryToSession();" in delete_fn
    push_fn = script.split("function pushMemoryToSession() {")[1].split("\n}")[0]
    assert '"session.update"' in push_fn
    # Entries beyond the prompt window are marked, or a delete looks like a no-op.
    assert "未進入 Prompt" in script
    # Memory values come from the model, so they are escaped before innerHTML.
    assert "const escapeHtml =" in script
    assert "escapeHtml(memoryEntryText(entry))" in script
    # Retention was dead schema; it is now a visible label on both sides.
    assert "function memoryLayerHeadings(memoryPolicy)" in script
    assert "保存 ${policy.fact_retention_days ?? 365} 天" in script
    # The red-team prompts are in the page, unautomated on purpose.
    assert "紅隊挑戰" in page
    assert "後四碼" in page


def test_proactive_can_actually_speak_first() -> None:
    import pytest
    from fastapi import HTTPException

    from dodo_workshop.web import ProactiveDecideRequest, proactive_decide

    policy = bootstrap()["workshop2_starter"]["profile"]["proactive_policy"]
    elder = {"wake_time": "05:00", "bed_time": "21:30", "routines": []}

    allowed = proactive_decide(
        ProactiveDecideRequest(
            policy=policy,
            elder_profile=elder,
            scenario={"time": "15:30", "type": "chat", "minutes_since_last": 90, "sent_today": 1},
        )
    )
    assert allowed["should_speak"] and allowed["rule"] == "speak"

    # Bedtime still wins for anything that is not a reminder.
    quiet = proactive_decide(
        ProactiveDecideRequest(policy=policy, elder_profile=elder, scenario={"time": "23:30", "type": "chat"})
    )
    assert not quiet["should_speak"] and quiet["rule"] == "quiet"

    reminder = proactive_decide(
        ProactiveDecideRequest(
            policy=policy,
            elder_profile=elder,
            scenario={"time": "23:30", "type": "reminder", "minutes_since_last": 1, "sent_today": 9, "user_declined": True},
        )
    )
    assert reminder["should_speak"] and reminder["rule"] == "reminder"

    with pytest.raises(HTTPException):
        proactive_decide(ProactiveDecideRequest(policy=policy, scenario={"time": "15:30", "type": "emergency"}))
    with pytest.raises(HTTPException):
        proactive_decide(ProactiveDecideRequest(policy=policy, scenario={"time": "晚上", "type": "chat"}))

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    server = (Path(__file__).resolve().parents[1] / "dodo_workshop" / "web.py").read_text(
        encoding="utf-8"
    )

    assert 'id="triggerProactive"' in page
    assert 'fetch("/api/proactive-decide"' in script
    assert "async function triggerProactive()" in script
    # Response-level instructions REPLACE the session's, so the persona has to
    # travel with the proactive brief.
    assert "function proactiveTurnInstructions(event, time, policy)" in script
    assert "if (instructions) response.instructions = instructions;" in script
    # A proactive message must not talk over 豆豆's current sentence. The guard
    # lives in the speak path both the manual button and the 待提醒 scheduler use,
    # so a scheduled reminder cannot interrupt what a manual one may not.
    speak = script.split("async function speakProactive(event, time, policy) {")[1].split("\n}\n")[0]
    assert "if (isDodoSpeaking())" in speak
    assert "sendProactiveResponse(proactiveTurnInstructions(" in speak
    assert "recordProactiveSpoken();" in speak
    trigger = script.split("async function triggerProactive() {")[1].split("\n}\n")[0]
    assert "await speakProactive(event, time, policy)" in trigger
    # The dead endpoint nothing ever called is gone.
    assert "/api/proactive-message" not in server
    assert "/api/proactive-message" not in script


def test_memory_writes_accumulate_instead_of_overwriting() -> None:
    """「我喜歡唱歌」then「我喜歡跳舞」left only 跳舞.

    Every write matched on `key` alone and overwrote, so a second fact under the
    same category ate the first. The layer now decides: A keeps both, B is the
    latest state, C is recomputed — and only an explicit mode=replace discards.
    """

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert "const MEMORY_MERGE_RULES = {" in script
    rules = script.split("const MEMORY_MERGE_RULES = {")[1].split("};")[0]
    assert 'A: { merge: "accumulate"' in rules
    assert 'B: { merge: "supersede"' in rules
    assert 'C: { merge: "rewrite"' in rules
    # B is the only capped layer: 近期事件 that can never be refreshed are noise.
    assert "capacity: MEMORY_PREVIEW_LIMIT" in rules

    upsert = script.split("function upsertMemory(layerId, key, value, mode) {")[1].split("\n}\n")[0]
    # Same key AND same value is a no-op, which is what makes a re-run of the
    # 記憶分類 exercise idempotent instead of duplicating every card.
    assert "memoryEntryKey(entry) === key && memoryEntryValue(entry) === value" in upsert
    # Accumulate keeps the list untouched; only the other modes filter by key.
    assert 'const accumulate = (mode || rule.merge) === "accumulate";' in upsert
    assert "entry) => memoryEntryKey(entry) !== key" in upsert
    assert "rule.capacity ? Math.max(0, entries.length - rule.capacity) : 0" in upsert

    # The model has to be told, or it keeps assuming a second save overwrites.
    assert 'enum: ["add", "replace", "remove"]' in script
    assert 'String(args.mode || "").trim().toLowerCase() === "replace"' in script
    # Nothing writes memory except through the one helper.
    assert script.count("function upsertMemory(") == 1
    assert "workspace.memory[field].push(" not in script


def test_the_model_can_retract_exactly_one_remembered_value() -> None:
    """Accumulating created a gap: once「興趣：西瓜」is stored,「我不喜歡吃西瓜」
    cannot be handled by writing another fact, and mode="replace" would discard
    鳳梨 and 芭樂 too. Without a removal the memory keeps both「喜歡西瓜」and
    「不喜歡西瓜」side by side forever."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    forget = script.split("function forgetMemory(layerId, key, value) {")[1].split("\n}\n")[0]
    # key AND value, or removing 西瓜 would take 鳳梨 and 芭樂 with it.
    assert "memoryEntryKey(entry) === key && memoryEntryValue(entry) === value" in forget
    assert "if (removed) workspace.memory[field] = kept;" in forget
    # What is left under the key travels back, so a near-miss can be retried.
    assert "remaining: kept.filter((entry) => memoryEntryKey(entry) === key)" in forget

    tool = script.split("async function executeRealtimeTool(call) {")[1].split("\n}\n")[0]
    assert 'String(args.mode || "").trim().toLowerCase() === "remove"' in tool
    # Removal is dispatched BEFORE the X keyword guard: that guard stops
    # sensitive data going in, and must never stop it being taken back out.
    remove_at = tool.index('=== "remove"')
    guard_at = tool.index("(密碼|password|api.?key|金鑰|帳號|信用卡|驗證碼)")
    assert remove_at < guard_at, "the X guard would block 豆豆 from forgetting"
    # A miss must say what IS stored rather than silently reporting success.
    assert "找不到要移除的記錄" in tool

def test_a_saved_project_learns_the_new_memory_merge_rule() -> None:
    """A stored 記憶使用規則 wins over the default, so a project saved before the
    累加／replace rule existed would show a block that contradicts the behaviour
    its own memory now follows."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    profile_source = (
        Path(__file__).resolve().parents[1] / "dodo_workshop" / "profile.py"
    ).read_text(encoding="utf-8")

    # Every inserted line must be a line the fresh default also carries.
    assert "const MEMORY_USE_GUIDANCE = [" in script
    block = script.split("const MEMORY_USE_GUIDANCE = [")[1].split("\n];")[0]
    lines = [part.split("',")[0] for part in block.split("  '")[1:]]
    assert len(lines) == 2, lines
    # The backend now retires the whole schema-1 block by prefix instead of
    # patching lines into it; the browser-side patcher leaves with the old tab.
    assert "LEGACY_MEMORY_USE_PREFIX" in profile_source

    migrate = script.split("function migrateWorkshop2Blocks(blocks) {")[1].split("\n}\n")[0]
    # Empty stays empty (deleted on purpose), and a block the student rewrote
    # past recognition is left alone.
    assert "if (!stored) return blocks;" in migrate
    assert "if (anchor < 0) return blocks;" in migrate
    # Old revisions are stripped by prefix and replaced, NOT skipped. The first
    # version gated on `mode="replace"` — a string every revision contains — so
    # a project migrated once could never receive a later revision.
    assert "MEMORY_USE_GUIDANCE_PREFIXES.some((prefix) => line.startsWith(prefix))" in migrate
    assert 'stored.includes(\'mode="replace"\')' not in migrate
    # Idempotent: an already-current block comes back untouched.
    assert "return merged === stored ? blocks : " in migrate
    # Both hydration paths run it, or an import would carry the stale text back.
    assert script.count("migrateWorkshop2Blocks(workspace.profile.workshop2_blocks)") == 2


def test_the_prompt_says_which_layer_a_preference_belongs_to() -> None:
    """「我喜歡吃西瓜」landed in B, whose own example was「今天想吃什麼」 —— and B
    supersedes, so 芭樂／西瓜／鳳梨 were each eaten by the next fruit. Changing the
    quiz card fixed what the *student* reads; this is what the *model* reads."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    blocks = bootstrap()["default_workspace"]["profile"]["workshop2_blocks"]
    memory_use = blocks["memory_use"]

    # The tool description is the only guidance not persisted per project, so it
    # is the one place a fix reaches a student who already has a saved Dodo.
    layer_field = script.split('layer: {')[1].split("},")[0]
    assert "長期偏好" in layer_field and "並存" in layer_field
    assert "只留最新一筆" in layer_field, "B's destructive merge has to be stated"
    assert "不要放 B" in layer_field

    # …and the default block spells the same distinction out.
    assert "喜歡或不喜歡的食物" in memory_use
    assert "layer=A" in memory_use and "新的不會吃掉舊的" in memory_use
    # B's example must not read as a preference any more.
    assert "今天想吃什麼" not in memory_use
    assert "新的取代舊的" in memory_use


def test_a_supersede_names_the_value_it_threw_away() -> None:
    """「覆蓋原本 1 筆」gave a student no way to notice 芭樂 had just been eaten."""

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    upsert = script.split("function upsertMemory(layerId, key, value, mode) {")[1].split("\n}\n")[0]
    assert "const superseded = workspace.memory[field]" in upsert
    assert "const replaced = superseded.length;" in upsert
    describe = script.split("function describeMemoryWrite(result, key, value) {")[1].split("\n}\n")[0]
    assert "丟掉了：${result.superseded.join" in describe
    assert "覆蓋原本" not in describe

def test_proactive_policy_has_a_live_picture_and_self_explaining_fields() -> None:
    """Five bare number fields never showed what they add up to, and the manual
    trigger's 距上次／今日已發送 never said which policy value they are compared
    against — that lived one tab away."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert 'id="quietBand"' in page and 'id="policySummary"' in page and 'id="policyBinding"' in page
    assert "function renderPolicyPreview()" in script
    assert 'Array.from({ length: 24 }, (_, hour)' in script
    # The band must agree with the decider, wrap-around included.
    quiet = script.split("function isQuietHour(hour, start, end) {")[1].split("\n}")[0]
    assert "start > end ? hour >= start || hour < end : hour >= start && hour < end" in quiet
    # Naming the binding limit is the point: changing 冷卻 does nothing visible
    # when 每日上限 was the one biting all along.
    assert "真正卡住的是" in script
    assert ".quiet-band" in styles and ".band-hour.is-quiet" in styles

    assert 'id="sinceLastHint"' in page and 'id="sentTodayHint"' in page and 'id="nowHint"' in page
    hints = script.split("function renderTriggerHints() {")[1].split("\n}\n")[0]
    assert "policy.cooldown_minutes" in hints and "policy.daily_message_limit" in hints
    assert "會被擋下" in hints and "會通過" in hints

    # 取消變更 writes fields programmatically, which fires no input event.
    revert = script.split("function revertGroup(groupName) {")[1].split("\n}\n")[0]
    assert "renderPolicyPreview();" in revert and "renderTriggerHints();" in revert


def test_scheduled_reminders_fire_on_the_real_clock() -> None:
    """模擬現在時間 was the only time field, and nothing ever watched a clock —
    so setting a 提醒 time did nothing when that time came round."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    default_scheduled = bootstrap()["default_workspace"]

    assert 'id="scheduleTime"' in page and 'id="addSchedule"' in page
    assert 'id="scheduleList"' in page and 'id="scheduleAuto"' in page
    assert default_scheduled["scheduled"] == []
    assert default_scheduled["proactive_state"]["sent_today"] == 0

    assert "function startScheduler()" in script
    assert "setInterval(tickScheduler, SCHEDULE_TICK_MS)" in script
    tick = script.split("async function tickScheduler() {")[1].split("\n}\n")[0]
    assert 'item.status === "pending" && item.time <= nowText' in tick
    # One per tick: firing two at once would let the second skip the cooldown
    # the first is supposed to impose on it.
    assert "await fireScheduledItem(due[0]);" in tick
    assert "schedulerBusy" in tick

    fire = script.split("async function fireScheduledItem(item) {")[1].split("\n}\n")[0]
    # Real clock and real accumulated spend — that is what separates a scheduled
    # reminder from the manual what-if trigger.
    assert "minutes_since_last_message: minutesSinceLastProactive()" in fire
    assert "messages_today: proactiveState().sent_today" in fire
    # The 剛被拒絕 checkbox is a what-if for the manual trigger only; reading it
    # here would let a hypothesis silently kill a real scheduled reminder.
    assert "user_declined: false," in fire
    assert 'user_declined: $("#proactiveDeclined").checked' not in fire
    # A transport failure must not burn the item, and mid-sentence is temporary.
    assert "if (!decision) {" in fire
    assert 'if (outcome === "busy") return;' in fire
    # It must not claim 已說出 when there was no session to say it in.
    assert 'item.status = outcome === "spoken" ? "spoken" : "blocked";' in fire

    # The pending list is deletable, like every other thing a human must be able
    # to take back in this workshop.
    assert "function deleteSchedule(id)" in script
    assert 'event.target.closest("[data-schedule-id]")' in script
    # Real spend survives F5, or 每日上限 quietly refunds itself.
    assert "function recordProactiveSpoken()" in script
    assert "state.sent_today += 1;" in script
    assert 'if (state.day !== todayKey())' in script


def test_lab_panels_are_tabbed_with_a_title_bar_apply_button() -> None:
    """The right panel was one scrolling column of every control at once, with
    套用 buried at the bottom. Each panel is tabbed now and 套用 sits in the title
    row — rendered only when a field differs from what the live session has."""

    import re

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    # Every tab button points at a panel that exists, and each bar opens on one.
    declared = set(re.findall(r'id="([A-Za-z0-9_-]+)"', page))
    tabs = re.findall(r'data-tab="([A-Za-z0-9_-]+)"', page)
    assert tabs, "no tab buttons in the page"
    assert set(tabs) <= declared, set(tabs) - declared
    for bar in re.findall(r'<div class="tab-bar".*?</div>', page, re.S):
        assert bar.count("is-active") == 1, bar[:120]

    # 套用 moved into the title row of both sections and starts hidden.
    for button in ("saveWorkshop1", "saveWorkshop2"):
        heading = page.split(f'id="{button}"')[0].rsplit('<div class="section-heading">', 1)[1]
        assert "<h2>" in heading, button
        assert f'id="{button}" class="primary-button apply-button" hidden' in page, button
    assert 'class="lab-actions"' not in page.split('id="saveWorkshop1"')[0]

    # Dirty is measured against the last apply, not against `workspace` — 執行 6
    # 個情境 and friends call collectWorkshop2() without any session.update, so a
    # workspace comparison would hide a genuinely unapplied change.
    assert "const appliedSnapshots = {}" in script
    assert "function markApplied(groupName)" in script
    assert "function refreshApplyState()" in script
    collect_two = script.split("function collectWorkshop2() {")[1].split("\n}")[0]
    assert "markApplied" not in collect_two
    # Snapshot baseline is taken where state arrives, and refreshed on apply.
    assert "markApplied();" in script.split("function loadFields() {")[1].split("\n}")[0]
    for name in ("applyWorkshop1", "applyWorkshop2"):
        body = script.split(f"async function {name}() {{")[1].split("\n}")[0]
        assert "markApplied(" in body, name
    # Assigning .value fires no input event, so a preset has to say so itself.
    assert "refreshApplyState();" in script.split("function applyPreset(id) {")[1].split("\n}")[0]

    # Every control 套用 sends is wired, including the four that had no listener.
    for selector in ("#agentVoice", "#semanticEagerness", "#silenceDuration", "#interruptResponse"):
        assert f'"{selector}"' in script.split("const WORKSHOP1_FIELDS = [")[1].split("];")[0]
    assert '["input", "change"].forEach' in script

    assert ".tab-button.is-dirty::after" in styles
    assert ".tab-button.is-active" in styles
    assert ".section-heading" in styles
    # Dead after the rewrite; leaving them would rot.
    for stale in ("lab-block", "block-heading", "layer-number"):
        assert stale not in page, stale
        assert stale not in styles, stale


def test_passing_status_no_longer_floods_the_transcript() -> None:
    """SYSTEM rows for every 套用 / session.updated / preset load pushed the
    conversation off screen. Those go to the state bar; the transcript keeps
    errors, refusals and milestones."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    assert 'id="activityNote"' in page and 'role="status"' in page
    assert "function notify(text)" in script
    for moved in ("Realtime 已確認套用", "已套用「", "第二堂設定已套用", "已載入「"):
        assert f'addMessage("system", `{moved}' not in script, moved
        assert f'addMessage("system", "{moved}' not in script, moved
    # …and the ones that must still interrupt the student are still rows.
    for kept in ("瀏覽器擋住了自動播放", "Realtime 回報設定錯誤", "目前沒有連接 OpenAI 模型"):
        assert kept in script, kept
    # The one-shot preamble explainer used to fire on the first tool call. The
    # dashed PREAMBLE label already makes that point without a SYSTEM row.
    assert "上面那格是 preamble" not in script
    assert "preambleExplained" not in script

    # An escape hatch that hides the instrumentation without discarding it.
    assert 'id="chatOnly"' in page
    assert '$("#messages").classList.toggle("is-chat-only"' in script
    assert ".messages.is-chat-only .message.tool" in styles
    assert ".activity-note" in styles


def test_offer_always_carries_an_audio_media_section() -> None:
    """打字輸入／文字輸出 — the default classroom mode — could not connect.

    A data-channel-only offer has no audio m-line, and OpenAI rejects it with
    `invalid_offer: Offer did not have an audio media section.` The transceiver
    used to be added only when input or output was voice.
    """

    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    body = script.split("async function openRealtimeConnection() {")[1].split("\nasync function")[0]

    assert 'peerConnection.addTransceiver("audio", { direction: "recvonly" });' in body
    # The guard that skipped it for text/text is gone.
    assert '} else if (setup.outputMode === "voice") {' not in body
    assert body.count('addTransceiver("audio"') == 1
    # Still only one audio path: a real mic track, or the placeholder section.
    assert "peerConnection.addTrack(microphoneTrack, stream);" in body


def test_unapplied_changes_can_be_thrown_away() -> None:
    """套用 tells you something is pending; without a counterpart the only way
    back to the applied state was to remember and retype it."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    for button in ("revertWorkshop1", "revertWorkshop2"):
        assert f'id="{button}" class="secondary-button apply-button" hidden' in page, button
    assert "function revertGroup(groupName)" in script
    # The snapshot IS the last applied value, so write() can replay it directly.
    assert "tab.write(JSON.parse(appliedSnapshots[tabId]));" in script
    # Assigning .value fires no events — previews and buttons must be told.
    revert = script.split("function revertGroup(groupName) {")[1].split("\n}")[0]
    assert "rebuildSystemPrompt();" in revert and "refreshApplyState();" in revert
    # Visibility falls out of the ordinary dirty computation, never toggled apart.
    refresh = script.split("function refreshApplyState() {")[1].split("\n}")[0]
    assert "$(group.revert).hidden = clean;" in refresh
    assert "$(group.button).hidden = clean;" in refresh
    # Restoring the turn mode has to restore which mode-specific field shows.
    assert "updateTurnFields();" in script.split("tabTurn: {")[1].split("},\n    },")[0]


def test_lab_results_collapse_and_keep_their_score() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")

    for panel in ("memoryOutcome", "proactiveOutcome", "dayOutcome"):
        assert f'<details id="{panel}" class="result-panel" hidden>' in page, panel
    # The existing result containers keep their ids; they are wrapped, not moved.
    for kept in ("memoryExplanations", "proactiveResults", "daySummary", "dayTimeline"):
        assert f'id="{kept}"' in page, kept
    assert "function showResult(panelSelector, headlineSelector, headline)" in script
    assert script.count("showResult(") == 4  # definition + three call sites
    assert ".result-panel > summary" in styles


def test_proactive_event_types_are_rendered_from_the_project_priorities() -> None:
    """None of the six types is wired to a data source — not even weather. The
    type only picks a priority number and a line of prompt text, so the numbers
    are rendered from `proactive_policy.priorities` instead of being hardcoded."""

    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    script = (WEB_DIR / "app.js").read_text(encoding="utf-8")

    assert '<select id="proactiveEventType"></select>' in page
    assert '<option value="reminder">' not in page
    assert "function renderProactiveEventOptions()" in script
    render = script.split("function renderProactiveEventOptions() {")[1].split("\n}")[0]
    # From the live fields, not the saved workspace: 事件優先權 is editable now,
    # so lowering emergency has to reach this dropdown before 套用.
    assert "proactivePolicyFromFields().priorities" in render
    assert "優先權 ${score}" in render
    assert "renderProactiveEventOptions();" in script.split("function loadFields() {")[1].split("\n}")[0]
    # And the panel says so, rather than leaving students to assume integrations.
    assert "沒有串接任何資料來源" in page
    assert "沒有排程器" in page


# --- Workshop 2 endpoints: 建檔 → 她的一天 → 今日摘要 --------------------------


def test_intake_check_counts_sections_and_names_missing_reminders() -> None:
    from dodo_workshop.web import IntakeCheckRequest, intake_check

    empty = intake_check(IntakeCheckRequest())
    assert {row["section"] for row in empty["completeness"]} == {
        "medications", "routines", "symptoms", "interests", "taboos", "declined_notes", "emergency_contact",
    }
    assert not any(row["done"] for row in empty["completeness"])
    assert [item["time"] for item in empty["missing_reminders"]] == ["07:00", "21:00"]

    partial = intake_check(IntakeCheckRequest(elder_profile={"medications": [{"name": "藥", "time": "07:00"}]}))
    assert [item["time"] for item in partial["missing_reminders"]] == ["21:00"]
    assert next(row for row in partial["completeness"] if row["section"] == "medications")["have"] == 1


def test_simulated_day_can_run_against_dodos_fixed_gates() -> None:
    """The comparison toggle: same rules, her 作息 swapped for what production hard-codes."""

    from dodo_workshop.web import DaySimulationRequest, proactive_simulate

    policy = {"interval_minutes": 30, "daily_limit": 4}
    hers = proactive_simulate(DaySimulationRequest(policy=policy, gates="reference"))
    fixed = proactive_simulate(DaySimulationRequest(policy=policy, gates="dodo_fixed"))
    by_time = {step["time"]: step for step in fixed["steps"]}

    # 07:30 追問膝蓋 falls inside 22–08: 「她在睡」 by a clock that never met her.
    assert by_time["07:30"]["rule"] == "quiet" and by_time["07:00"]["spoke"]
    # And the 12:45 chat wakes her from a nap the fixed gates know nothing about.
    assert by_time["12:45"]["spoke"]
    assert fixed["schedule"]["quiet"]["label"].startswith("正式 dodo")
    assert hers["schedule"]["dnd"][0]["label"] == "早餐"
    assert fixed["gates"] == "dodo_fixed" and hers["gates"] == "reference"


def test_a_students_own_day_is_grown_from_their_file() -> None:
    from dodo_workshop.web import DaySimulationRequest, proactive_simulate

    mine = proactive_simulate(
        DaySimulationRequest(
            policy={"interval_minutes": 30, "daily_limit": 4},
            elder_profile={"wake_time": "06:00", "bed_time": "22:00", "medications": [{"name": "藥", "time": "08:00"}]},
            memory={"facts": [], "events": []},
            events_from="mine",
        )
    )

    assert [step["time"] for step in mine["steps"] if step["type"] == "reminder"] == ["08:00"]
    assert mine["missing_reminders"] == []  # the reference diff only makes sense against the shared day


def test_day_summary_needs_a_key_and_sends_the_transcript_as_speakers(monkeypatch) -> None:
    import pytest
    from fastapi import HTTPException

    import dodo_workshop.web as web_module
    from dodo_workshop.web import DaySummaryRequest, TranscriptLine, day_summary

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(web_module, "_runtime_api_key", None)
    with pytest.raises(HTTPException) as refused:
        day_summary(DaySummaryRequest(transcript=[TranscriptLine(role="user", text="膝蓋好多了")]))
    assert refused.value.status_code == 503

    seen: dict = {}

    class FakeModel:
        def __init__(self, api_key=None, offline=False):
            seen["key"] = api_key

        def generate(self, instructions, user_input, fallback=None):
            seen["instructions"], seen["input"] = instructions, user_input
            return "膝蓋這幾天好轉，下次可以問還會不會痛。"

    monkeypatch.setattr(web_module, "_runtime_api_key", "sk-test")
    monkeypatch.setattr(web_module, "TextModel", FakeModel)
    result = day_summary(
        DaySummaryRequest(
            address="秀蘭阿嬤",
            transcript=[TranscriptLine(role="user", text="膝蓋好多了"), TranscriptLine(role="dodo", text="太好了")],
        )
    )

    assert result["summary"].startswith("膝蓋")
    assert seen["key"] == "sk-test"
    assert seen["input"] == "長者：膝蓋好多了\n豆豆：太好了"
    assert "秀蘭阿嬤" in seen["instructions"] and "不寫密碼" in seen["instructions"]


def test_bootstrap_ships_the_interview_but_never_the_answer_key() -> None:
    data = bootstrap()

    assert data["interview_markdown"].startswith("# 訪談稿：秀蘭阿嬤")
    assert data["simulated_weekday"] == 2 and data["completeness_expected"]["symptoms"] == 3
    assert set(data["event_types"]) == {"reminder", "health", "chat"}
    assert "memory_cards" not in data and "proactive_scenarios" not in data
    dumped = json.dumps(data, ensure_ascii=False)
    # The taboo *rules* exist only in the reference file; the interview never says them.
    assert "她自己提起才回應" not in dumped
    assert "expected_counts" not in data and "reference" not in data
