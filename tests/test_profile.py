from dodo_workshop.profile import (
    DEFAULT_PROMPT_BLOCKS,
    compose_agent_prompt,
    normalize_workspace,
    workshop2_starter,
)


def test_normalize_workspace_preserves_student_changes_and_adds_defaults() -> None:
    workspace = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {"agent": {"name": "小暖"}},
            "progress": {"workshop_1_completed": True},
        }
    )

    assert workspace["profile"]["agent"]["name"] == "小暖"
    assert workspace["profile"]["agent"]["max_output_tokens"] == 180
    assert workspace["profile"]["agent"]["prompt_blocks"] == DEFAULT_PROMPT_BLOCKS
    assert workspace["profile"]["realtime"]["turn_detection"]["type"] == "semantic_vad"
    assert workspace["progress"]["workshop_1_completed"] is True


def test_prompt_is_composed_from_named_blocks_and_replaces_variables() -> None:
    prompt = compose_agent_prompt(
        {
            "name": "豆豆",
            "address": "王奶奶",
            "prompt_blocks": {
                **DEFAULT_PROMPT_BLOCKS,
                "conversation_style": "先傾聽，再回應。一次只問一件事。",
            },
        }
    )

    assert "# 角色與身分" in prompt
    assert "你是「豆豆」" in prompt
    assert "陪伴 王奶奶" in prompt
    assert "# 個性與聲音" in prompt
    assert "語速比平常慢約二成" in prompt
    assert "# 對話方式\n先傾聽，再回應。一次只問一件事。" in prompt
    assert "# 語言" in prompt
    assert "繁體中文為主" in prompt
    assert "中國大陸用語" in prompt
    assert "# 邊界與安全" in prompt
    assert "{AGENT_NAME}" not in prompt
    assert "{USER_ADDRESS}" not in prompt
    assert "Hi" not in prompt and "Hello" not in prompt


def test_legacy_workspace_gets_prompt_blocks_and_read_only_prompt_built_from_identity() -> None:
    workspace = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {
                "agent": {"name": "小暖", "address": "林同學", "tone": "沉悶"}
            },
        }
    )

    agent = workspace["profile"]["agent"]
    assert agent["prompt_blocks"] == DEFAULT_PROMPT_BLOCKS
    assert "你是「小暖」" in agent["system_prompt"]
    assert "陪伴 林同學" in agent["system_prompt"]
    assert "沉悶" not in agent["system_prompt"]


def test_stale_full_prompt_is_always_rebuilt_from_blocks() -> None:
    workspace = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {
                "agent": {
                    "name": "豆豆",
                    "address": "陳阿公",
                    "system_prompt": "這段舊版完整 Prompt 不應被沿用",
                    "prompt_blocks": {
                        **DEFAULT_PROMPT_BLOCKS,
                        "safety": "不確定時就說不確定。",
                    },
                }
            },
        }
    )

    prompt = workspace["profile"]["agent"]["system_prompt"]
    assert "這段舊版完整 Prompt 不應被沿用" not in prompt
    assert "# 邊界與安全\n不確定時就說不確定。" in prompt


def test_workshop2_starter_contains_completed_workshop1() -> None:
    workspace = workshop2_starter()

    assert workspace["progress"]["workshop_1_completed"] is True
    assert workspace["progress"]["workshop_2_completed"] is False


def test_emptied_prompt_block_is_dropped_but_missing_key_still_defaults() -> None:
    """Mirrors the browser rule so a saved project round-trips identically."""

    from dodo_workshop.profile import (
        DEFAULT_PROMPT_BLOCKS,
        compose_agent_prompt,
        prompt_blocks_for,
    )

    # Emptied on purpose → section omitted.
    agent = {
        "name": "豆豆",
        "address": "王奶奶",
        "prompt_blocks": {**DEFAULT_PROMPT_BLOCKS, "language": "", "safety": "   "},
    }
    prompt = compose_agent_prompt(agent)
    assert "# 語言" not in prompt
    assert "# 邊界與安全" not in prompt
    assert "# 角色與身分" in prompt
    assert prompt_blocks_for(agent)["language"] == ""

    # Key absent (older project file) → default fills in.
    legacy = {"name": "豆豆", "address": "王奶奶", "prompt_blocks": {"identity": "自訂"}}
    blocks = prompt_blocks_for(legacy)
    assert blocks["identity"] == "自訂"
    assert blocks["language"] == DEFAULT_PROMPT_BLOCKS["language"]
    assert "# 語言" in compose_agent_prompt(legacy)

    # Every block cleared → empty prompt, which the UI warns about.
    blank = {"name": "豆豆", "address": "王奶奶", "prompt_blocks": dict.fromkeys(DEFAULT_PROMPT_BLOCKS, "")}
    assert compose_agent_prompt(blank) == ""
