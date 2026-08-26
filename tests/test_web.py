import asyncio

from dodo_workshop.web import (
    ApiKeyRequest,
    ProactiveCheckRequest,
    RealtimeCheckRequest,
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
    turn_check,
    weather_tool,
)


def test_shared_client_and_bootstrap_are_available() -> None:
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    styles = (WEB_DIR / "styles.css").read_text(encoding="utf-8")
    data = bootstrap()

    assert "同一個 Dodo，持續升級" in page
    assert "Prompt 與 Realtime 是兩層" in page
    assert "API Key" in page
    assert "用分塊設計回答方式" in page
    assert "完整 System Prompt" in page and "只能檢視" in page
    assert '<pre id="agentSystemPrompt"' in page
    assert '<textarea id="agentSystemPrompt"' not in page
    assert "可編輯的 Prompt 分塊" in page
    assert "實際 Realtime 聲線" in page
    assert ".onboarding[hidden] { display: none; }" in styles
    assert data["workshop2_starter"]["progress"]["workshop_1_completed"]


def test_default_realtime_settings_pass_five_previews() -> None:
    workspace = bootstrap()["default_workspace"]
    result = turn_check(
        RealtimeCheckRequest(
            realtime=workspace["profile"]["realtime"],
            max_output_tokens=workspace["profile"]["agent"]["max_output_tokens"],
        )
    )

    assert result["passed"]
    assert len(result["checks"]) == 5
    assert result["mode"] == "semantic_vad"


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
    assert 'id="saveApiKey"' in page and "儲存設定" in page
    assert 'id="saveApiKey" type="button" class="primary-button" disabled' in page
    assert 'id="weatherApiKeyInput" type="password"' in page
    assert 'id="testWeatherApiKey"' in page
    assert 'id="saveWeatherApiKey" type="button" class="primary-button" disabled' in page
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
    assert "return 0.82" in script
    assert "return 0.72" not in script
    assert "prompt_blocks: promptBlocksFromFields()" in script
    assert '$("#agentSystemPrompt").textContent = buildSystemPrompt' in script
    assert '$("#agentSystemPrompt").value' not in script
    assert "即使使用者只說" not in script
    assert "#promptIdentity" in script
    assert "#promptPersonalityTone" in script
    assert "#promptConversationStyle" in script
    assert "#promptLanguage" in script
    assert "#promptSafety" in script
    assert '"X-Dodo-Output-Mode": setup.outputMode' in script
    assert 'output_modalities: [setup?.outputMode === "voice" ? "audio" : "text"]' in script
    assert 'window.addEventListener("beforeunload", disconnectRealtime)' in script


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
    assert "grid-template-columns: 170px minmax(360px, 1fr) 10px var(--lab-width)" in styles
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
