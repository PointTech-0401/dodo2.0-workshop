import copy
import json

from dodo_workshop.config import ROOT, load_json
from dodo_workshop.profile import (
    DEFAULT_PROMPT_BLOCKS,
    EMPTY_ELDER_PROFILE,
    SCHEMA_VERSION,
    WORKSHOP2_PROMPT_BLOCKS,
    compose_agent_prompt,
    compose_full_instructions,
    compose_workshop2_prompt,
    normalize_workspace,
    workshop2_starter,
)

REFERENCE = load_json("scenarios/reference_profile.json")

# The browser client is three files now, split by workshop. Concatenated in the
# order index.html loads them, they are the one script the browser ends up with.
CLIENT_FILES = ("core.js", "workshop1.js", "workshop2.js")


def client_script() -> str:
    return "\n".join(
        (ROOT / "web" / name).read_text(encoding="utf-8") for name in CLIENT_FILES
    )


def reference_workspace() -> dict:
    return normalize_workspace(
        {
            "schema_version": 2,
            "profile": {"elder_profile": copy.deepcopy(REFERENCE["elder_profile"])},
            "memory": copy.deepcopy(REFERENCE["memory"]),
        }
    )


# --- Workshop 1 (unchanged behaviour) ---------------------------------------


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
    assert workspace["schema_version"] == SCHEMA_VERSION


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


def test_emptied_prompt_block_is_dropped_but_missing_key_still_defaults() -> None:
    """Mirrors the browser rule so a saved project round-trips identically."""

    from dodo_workshop.profile import prompt_blocks_for

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

    legacy = {"name": "豆豆", "address": "王奶奶", "prompt_blocks": {"identity": "自訂"}}
    blocks = prompt_blocks_for(legacy)
    assert blocks["identity"] == "自訂"
    assert blocks["language"] == DEFAULT_PROMPT_BLOCKS["language"]
    assert "# 語言" in compose_agent_prompt(legacy)

    blank = {"name": "豆豆", "address": "王奶奶", "prompt_blocks": dict.fromkeys(DEFAULT_PROMPT_BLOCKS, "")}
    assert compose_agent_prompt(blank) == ""


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


# --- Workshop 2 prompt: four attitude blocks + four generated sections -------


def reference_prompt() -> str:
    """The Workshop 2 half as the reference 秀蘭阿嬤 produces it.

    `test_prompt_matches_the_golden_fixture_shared_with_the_browser` pins this same
    text byte-for-byte; the tests below name *which* facts have to reach the model,
    so a failure says 「用藥沒進 Prompt」 instead of 「strings differ」.
    """

    return compose_workshop2_prompt(reference_workspace())


def test_the_prompt_opens_with_the_four_attitude_blocks() -> None:
    prompt = reference_prompt()

    for title in ("# 記憶使用規則", "# 重要提醒怎麼講", "# 健康關心怎麼問", "# 閒聊從哪裡開始"):
        assert title in prompt
    assert "{USER_ADDRESS}" not in prompt and "{AGENT_NAME}" not in prompt


def test_the_elder_section_is_generated_from_the_care_file() -> None:
    """Everything here was typed into 建檔 — except the phone, deliberately withheld."""

    prompt = reference_prompt()

    assert "# 長者資料\n稱呼：秀蘭阿嬤" in prompt
    assert "姓名：邱秀蘭（房號 305）" in prompt
    assert "她會的事（可以請教）：煮麵" in prompt
    assert "作息：05:00 起床、21:30 上床" in prompt
    assert "不打擾時段：早餐 06:30–07:00、午餐 11:00–11:30、午睡 12:30–14:00、歌唱班 15:00–16:00（週二、四）" in prompt
    assert "用藥：07:00 血壓藥、血糖藥（早餐後，配溫水）；21:00 安眠藥半顆" in prompt
    assert "回診／復健：每週三 09:30 復健" in prompt and "2026-09-04 09:00 回診 新陳代謝科" in prompt
    assert "緊急聯絡人：兒子 邱志明（電話由照護員保管" in prompt


def test_the_memory_section_marks_what_the_caregiver_wrote() -> None:
    """The marker is what tells the model which A facts it may not touch."""

    prompt = reference_prompt()

    assert "- 喜歡的歌：《望春風》［護理員］" in prompt  # all 13 caregiver facts fit
    assert "- 膝蓋：右膝這幾天更痛，下雨天更痛（上週開始）［護理員］" in prompt
    assert "C 跨日摘要（由系統整理，不是人寫的）：（目前沒有任何記錄）" in prompt


def test_taboos_get_their_own_section() -> None:
    """Remembered, known to the model, never raised first."""

    assert "# 不主動提起\n- 先生臥床六年與過世：她自己提起才回應，不主動問" in reference_prompt()


def test_the_program_rules_are_derived_from_the_same_care_file() -> None:
    """The two knobs plus the windows computed from 作息 — stated, not enforced, here."""

    prompt = reference_prompt()

    assert "兩則之間至少間隔 30 分鐘，每天最多 4 則" in prompt
    assert "她上床（21:30）到起床（05:00）之間只送重要提醒" in prompt
    assert "不打擾時段（早餐、午餐、午睡、歌唱班、晚餐、八點檔）只送重要提醒" in prompt
    assert "每則主動訊息最多 2 句" in prompt


def test_an_empty_care_file_still_yields_every_generated_section() -> None:
    prompt = compose_workshop2_prompt(normalize_workspace(None))

    assert "# 長者資料\n稱呼：王奶奶\n居住城市：未提供" in prompt  # falls back to Workshop 1's 稱呼
    assert "# 不主動提起\n（建檔沒有填。" in prompt
    assert "建檔沒有填起床與上床時間，所以沒有安靜時段" in prompt
    assert "電話" not in prompt.split("# 長者資料")[1].split("# 目前記得的事")[0]


def test_memory_dump_in_instructions_is_bounded() -> None:
    workspace = normalize_workspace(
        {
            "schema_version": 2,
            "memory": {
                "facts": [{"key": f"項目{index}", "value": "內容"} for index in range(20)],
                "events": [],
                "summaries": [],
            },
        }
    )
    prompt = compose_workshop2_prompt(workspace)

    assert "另有 4 筆較舊記錄未列出" in prompt
    assert "項目19" in prompt  # newest kept
    assert "項目0：" not in prompt  # oldest dropped


def test_emptied_workshop2_block_is_dropped_but_missing_key_defaults() -> None:
    cleared = normalize_workspace(
        {"schema_version": 2, "profile": {"workshop2_blocks": {"attitude_chat": ""}}}
    )

    prompt = compose_workshop2_prompt(cleared)
    assert "# 閒聊從哪裡開始" not in prompt
    assert cleared["profile"]["workshop2_blocks"]["memory_use"] == WORKSHOP2_PROMPT_BLOCKS["memory_use"]
    assert "# 記憶使用規則" in prompt
    # Generated sections never disappear: they are the data, not prose.
    assert "# 長者資料" in prompt and "# 主動訊息的程式規則" in prompt


def test_prompt_matches_the_golden_fixture_shared_with_the_browser() -> None:
    """The browser composes the same text from unsaved fields. One fixture, two
    consumers — a comment saying 「keep in sync」 never did."""

    workspace = json.loads((ROOT / "tests" / "fixtures" / "workshop2_workspace.json").read_text(encoding="utf-8"))
    expected = (ROOT / "tests" / "fixtures" / "workshop2_prompt.txt").read_text(encoding="utf-8")

    assert compose_workshop2_prompt(workspace) == expected
    assert normalize_workspace(workspace) == workspace, "fixture must already be normalized"


# --- Schema 1 → 2 migration -------------------------------------------------


def test_schema_one_policy_and_interests_migrate_and_legacy_keys_are_dropped() -> None:
    legacy = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {
                "elder_profile": {"name": "王美麗", "address": "王奶奶", "city": "台中", "interests": ["種蘭花", "老歌"]},
                "memory_policy": {"fact_retention_days": 365},
                "safety_policy": {"emergency": "…"},
                "proactive_policy": {
                    "quiet_hours": {"start": 22, "end": 8},
                    "cooldown_minutes": 60,
                    "daily_message_limit": 3,
                    "max_message_sentences": 2,
                    "priorities": {"emergency": 100},
                },
                "workshop2_blocks": {"proactive": "舊的主動關心規則", "memory_use": WORKSHOP2_PROMPT_BLOCKS["memory_use"]},
            },
            "memory": {"facts": [{"key": "過敏", "value": "花生"}], "events": ["昨晚沒睡好"], "summaries": []},
        }
    )
    profile = legacy["profile"]

    assert legacy["schema_version"] == 2
    assert profile["proactive_policy"] == {"interval_minutes": 60, "daily_limit": 3}
    assert "memory_policy" not in profile and "safety_policy" not in profile
    assert set(profile["elder_profile"]) == set(EMPTY_ELDER_PROFILE)
    assert profile["elder_profile"]["city"] == "台中"
    assert [f["value"] for f in legacy["memory"]["facts"] if f["tag"] == "interest"] == ["種蘭花", "老歌"]
    assert all(f["source"] == "caregiver" for f in legacy["memory"]["facts"] if f["tag"] == "interest")
    # Model writes without a source are the model's; a bare string becomes an entry.
    assert legacy["memory"]["facts"][0] == {"key": "過敏", "value": "花生", "source": "dodo", "tag": None}
    assert legacy["memory"]["events"] == [{"key": "", "value": "昨晚沒睡好", "source": "dodo", "tag": None}]
    assert set(profile["workshop2_blocks"]) == set(WORKSHOP2_PROMPT_BLOCKS)
    assert "proactive" not in profile["workshop2_blocks"]
    assert "declined_until" in legacy["proactive_state"]


def test_migration_reads_the_raw_file_so_a_customized_cooldown_survives() -> None:
    """After the defaults merge, `interval_minutes` already holds 30 — the only
    way to tell 「student set 30」 from 「student set nothing」 is the raw file."""

    kept = normalize_workspace({"schema_version": 1, "profile": {"proactive_policy": {"cooldown_minutes": 45}}})
    untouched = normalize_workspace({"schema_version": 1, "profile": {"proactive_policy": {}}})

    assert kept["profile"]["proactive_policy"]["interval_minutes"] == 45
    assert untouched["profile"]["proactive_policy"]["interval_minutes"] == 30


def test_an_unedited_legacy_memory_block_gets_the_new_default() -> None:
    old_default = "用 read_memory 讀取 {USER_ADDRESS} 的三層記憶，用 update_memory 保存新資訊……"
    replaced = normalize_workspace({"schema_version": 1, "profile": {"workshop2_blocks": {"memory_use": old_default}}})
    custom = normalize_workspace({"schema_version": 1, "profile": {"workshop2_blocks": {"memory_use": "我自己寫的規則"}}})

    assert replaced["profile"]["workshop2_blocks"]["memory_use"] == WORKSHOP2_PROMPT_BLOCKS["memory_use"]
    assert custom["profile"]["workshop2_blocks"]["memory_use"] == "我自己寫的規則"


def test_normalization_is_a_fixed_point_and_never_duplicates_interests() -> None:
    """`save_workspace` normalizes on every save; a project must not grow a new
    興趣 fact each time it is written."""

    once = normalize_workspace(
        {
            "schema_version": 1,
            "profile": {"elder_profile": {"interests": ["老歌", "老歌"]}},
            "memory": {"facts": [{"key": "興趣", "value": "老歌", "tag": "interest", "source": "caregiver"}]},
        }
    )
    source = copy.deepcopy(once)
    twice = normalize_workspace(source)

    assert twice == once
    # `_normalize_memory` copies entries one level deep and gets away with it only
    # because `_merge_defaults` deep-copied first. Pin that: the project handed in
    # must come back out untouched.
    assert source == once, "normalize_workspace must not mutate the project it is given"
    assert [f["value"] for f in once["memory"]["facts"]] == ["老歌"]
    assert normalize_workspace(reference_workspace()) == reference_workspace()


def test_unknown_schema_versions_are_refused() -> None:
    import pytest

    with pytest.raises(ValueError):
        normalize_workspace({"schema_version": 3})


# --- Shipped project files --------------------------------------------------


def test_workshop2_starter_is_workshop_one_done_with_an_empty_care_file() -> None:
    workspace = workshop2_starter()

    assert workspace["progress"]["workshop_1_completed"] is True
    assert workspace["progress"]["workshop_2_completed"] is False
    assert workspace["profile"]["elder_profile"] == EMPTY_ELDER_PROFILE
    assert workspace["profile"]["workshop2_blocks"] == WORKSHOP2_PROMPT_BLOCKS
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
    script = client_script()
    collect = script.split("function collectWorkshop1() {")[1].split("\n}")[0]
    assert "max_output_tokens" not in collect
    assert "delete agent.max_output_tokens;" in script


def test_shipped_project_files_are_already_schema_two() -> None:
    for name in ("starter/workshop2-default-dodo.json", "student/my-dodo.json"):
        shipped = json.loads((ROOT / name).read_text(encoding="utf-8"))
        assert shipped["schema_version"] == 2, name
        assert normalize_workspace(shipped) == shipped, f"{name} must be normalized"
