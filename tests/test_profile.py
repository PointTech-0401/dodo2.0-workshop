import json

from dodo_workshop.config import ROOT
from dodo_workshop.profile import (
    DEFAULT_PROMPT_BLOCKS,
    WORKSHOP2_PROMPT_BLOCKS,
    compose_agent_prompt,
    compose_full_instructions,
    compose_workshop2_prompt,
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


def test_workshop2_prompt_carries_elder_memory_and_proactive_rules() -> None:
    """Workshop 2's data used to reach the model only through a read_memory call.

    It is now a second half of the instructions: two editable blocks plus three
    sections generated from the fields the student edits.
    """

    workspace = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {"elder_profile": {"address": "陳阿公", "city": "台南"}},
            "memory": {
                "facts": [{"key": "花生", "value": "嚴重過敏"}],
                "events": [{"key": "睡眠", "value": "昨晚沒睡好"}],
                "summaries": [],
            },
        }
    )
    prompt = compose_workshop2_prompt(workspace)

    assert "# 記憶使用規則" in prompt and "# 主動關心規則" in prompt
    # {USER_ADDRESS} resolves to the elder's 稱呼 in this half.
    assert "陳阿公" in prompt and "{USER_ADDRESS}" not in prompt
    assert "# 長者資料" in prompt and "台南" in prompt
    # Retention rides in the heading: `memory_policy` was dead schema, and
    # 「保存 365 天」vs「保存 30 天」is what makes A and B different at all.
    assert "A 重要事實（保存 365 天）：\n- 花生：嚴重過敏" in prompt
    assert "B 近期事件（保存 30 天）：\n- 睡眠：昨晚沒睡好" in prompt
    assert "C 跨日摘要（由多次對話整理）：（目前沒有任何記錄）" in prompt
    # The rules the program enforces are stated, not left implicit.
    assert "安靜時段：22:00–08:00" in prompt
    assert "主動訊息冷卻：30 分鐘" in prompt
    assert "每日主動訊息上限：4 則" in prompt
    assert "emergency(100)" in prompt and prompt.index("emergency(100)") < prompt.index("news(20)")


def test_memory_dump_in_instructions_is_bounded() -> None:
    workspace = normalize_workspace(
        {
            "schema_version": 1,
            "memory": {
                "facts": [{"key": f"項目{index}", "value": "內容"} for index in range(12)],
                "events": [],
                "summaries": [],
            },
        }
    )
    prompt = compose_workshop2_prompt(workspace)

    assert "另有 4 筆較舊記錄未列出" in prompt
    assert "項目11" in prompt  # newest kept
    assert "項目0：" not in prompt  # oldest dropped


def test_full_instructions_are_workshop1_then_workshop2() -> None:
    workspace = normalize_workspace(None)
    instructions = compose_full_instructions(workspace)

    assert instructions.index("# 角色與身分") < instructions.index("# 記憶使用規則")
    # Stored `system_prompt` stays Workshop 1 only — the Workshop 2 half depends
    # on live memory and is composed at send time.
    assert workspace["profile"]["agent"]["system_prompt"] == compose_agent_prompt(
        workspace["profile"]["agent"]
    )
    assert "# 記憶使用規則" not in workspace["profile"]["agent"]["system_prompt"]


def test_emptied_workshop2_block_is_dropped_but_missing_key_defaults() -> None:
    cleared = normalize_workspace(
        {"schema_version": 1, "profile": {"workshop2_blocks": {"proactive": ""}}}
    )

    prompt = compose_workshop2_prompt(cleared)
    assert "# 主動關心規則" not in prompt
    # Missing key → default fills in, same rule as Workshop 1's blocks.
    assert cleared["profile"]["workshop2_blocks"]["memory_use"] == WORKSHOP2_PROMPT_BLOCKS["memory_use"]
    assert "# 記憶使用規則" in prompt
    # Generated sections never disappear: they are the data, not prose.
    assert "# 長者資料" in prompt and "# 主動訊息的程式規則" in prompt


def test_workshop2_starter_includes_the_new_prompt_layer() -> None:
    workspace = workshop2_starter()

    assert workspace["profile"]["workshop2_blocks"] == WORKSHOP2_PROMPT_BLOCKS
    # The preamble instruction is synced into the starter's Workshop 1 blocks.
    assert "preamble" in workspace["profile"]["agent"]["prompt_blocks"]["conversation_style"]


def test_no_output_token_cap_survives_anywhere_in_a_project() -> None:
    """「下載我的 Dodo」 kept re-exporting `max_output_tokens: 180`.

    It was only ever removed from the Realtime `session.update`; the profile
    schema and the CLI text path still carried it, and `_merge_defaults` keeps
    every key a student's file has — so an older project fed it straight back
    into the next export. Length is a Prompt concern here, not an API cap.
    """

    legacy = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {"agent": {"name": "小暖", "max_output_tokens": 180}},
        }
    )

    assert "max_output_tokens" not in legacy["profile"]["agent"]
    assert "max_output_tokens" not in json.dumps(legacy, ensure_ascii=False)
    assert "max_output_tokens" not in json.dumps(normalize_workspace(None), ensure_ascii=False)
    assert "max_output_tokens" not in json.dumps(workshop2_starter(), ensure_ascii=False)

    # The two shipped project files are what a student opens or imports.
    for name in ("starter/workshop2-default-dodo.json", "student/my-dodo.json"):
        assert "max_output_tokens" not in (ROOT / name).read_text(encoding="utf-8"), name

    # And the browser must not put it back on the way to the download.
    script = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    collect = script.split("function collectWorkshop1() {")[1].split("\n}")[0]
    assert "max_output_tokens" not in collect
    assert "delete agent.max_output_tokens;" in script
