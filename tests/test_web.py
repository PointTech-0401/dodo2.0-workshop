import asyncio
from pathlib import Path

from dodo_workshop.web import (
    ApiKeyRequest,
    ProactiveCheckRequest,
    WeatherRequest,
    WEB_DIR,
    active_weather_api_key,
    bootstrap,
    configure_api_key,
    configure_weather_api_key,
    proactive_check,
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
    assert "return buildSystemPrompt(workspace.profile.agent);" in script

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
    # The left LIVE STATE rail is gone, so the grid is chat + resizer + lab, and
    # the lab panel can be dragged out to a 1:1 split with the chat area.
    assert "grid-template-columns: minmax(360px, 1fr) 10px var(--lab-width)" in styles
    assert "signal-rail" not in styles and "signal-rail" not in page
    assert "LIVE STATE" not in page
    assert "LAB_WIDTH_MAX" not in script
    assert "usableWidth / 2" in script
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


def test_default_proactive_policy_passes_six_scenarios() -> None:
    workspace = bootstrap()["workshop2_starter"]
    result = proactive_check(
        ProactiveCheckRequest(policy=workspace["profile"]["proactive_policy"])
    )

    assert result["passed"]
    assert len(result["results"]) == 6


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
