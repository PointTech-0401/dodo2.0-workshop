from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from dodo_workshop.config import ROOT
from dodo_workshop.prompt_sections import (
    compose_elder_section,
    compose_memory_context,
    compose_rules_section,
    compose_taboo_section,
)


WORKSPACE_PATH = ROOT / "student" / "my-dodo.json"
WORKSHOP2_STARTER_PATH = ROOT / "starter" / "workshop2-default-dodo.json"

# 1 = 王奶奶 era (quiz cards, six priorities, quiet hours as a field).
# 2 = 建檔 era (elder_profile is a real care file, two knobs, schedule from 作息).
SCHEMA_VERSION = 2
SUPPORTED_SCHEMA_VERSIONS = frozenset({1, 2})


DEFAULT_PROMPT_BLOCKS: dict[str, str] = {
    "identity": """你是「{AGENT_NAME}」，陪伴 {USER_ADDRESS} 的虛擬孫女。
你的目標不是完成一次問答，而是透過每一次自然、可信賴的對話，慢慢建立長期的陪伴關係。""",
    "personality_tone": """語調輕柔緩慢，像最親密的家人在關懷。
語速比平常慢約二成，給對方充足時間理解與回應。
保持溫暖、耐心、咬字清楚與音調平穩；不要刻意裝可愛，也不要把對方當成小孩。""",
    "conversation_style": """自然地聊天、傾聽與回應，不要像客服或問卷。
先回應對方真正關心的事；資訊不足時先簡短確認，不自行猜測。
一次只問一件事，避免連續追問；回答要適合直接朗讀，不使用表格。
需要查天氣或讀寫記憶之前，先用一句話說明你正要做什麼，再去查（這句開場叫 preamble）。""",
    "language": """中文（繁體／國語）為主要語言。
不要主動把整段回答切換成英文、日文或其他語言；即使工具內容或專有名詞夾雜其他語言，回答仍以臺灣國語與繁體中文為主。
如果 {USER_ADDRESS} 明確詢問某個詞的外語說法，可以用國語解釋並附上該詞。避免中國大陸用語與年輕世代網路用語。""",
    "safety": """不要自行做醫療診斷，也不要假裝知道未提供的資訊。
遇到可能危及安全的狀況，先用簡短、清楚的方式確認當下安全，並建議尋求真人或專業協助。""",
}

# The built-in Realtime voices. OpenAI's own docs recommend marin/cedar for
# quality; `sage` stays the default because that is what the main dodo project
# uses. Note: a voice cannot be swapped mid-session once the model has produced
# audio, so changing it requires reconnecting.
REALTIME_VOICES: tuple[str, ...] = (
    "alloy",
    "ash",
    "ballad",
    "cedar",
    "coral",
    "echo",
    "marin",
    "sage",
    "shimmer",
    "verse",
)
DEFAULT_VOICE = "sage"


def resolve_voice(value: Any, fallback: str = DEFAULT_VOICE) -> str:
    """Accept only known built-in voices; anything else falls back."""

    candidate = str(value or "").strip().lower()
    return candidate if candidate in REALTIME_VOICES else fallback


# Workshop 2's own editable prompt layer. 建檔決定資料，Prompt 只寫態度: the four
# blocks are attitudes, and every fact the model needs is generated from the
# 建檔 and the memory below them. Workshop 1 decides how 豆豆 talks; these decide
# what it does with her memory and how it opens its mouth first.
WORKSHOP2_PROMPT_BLOCKS: dict[str, str] = {
    "memory_use": """記憶分三層，用 read_memory 讀、用 update_memory 寫，寫入時指定 layer：
A 重要事實（layer=A）：過敏、慢性病、醫囑、緊急聯絡人，以及長期偏好（喜歡或不喜歡的食物、音樂、活動）。同一個 key 可以並存多筆，新的不會吃掉舊的。標［護理員］的是護理員建的，你不能改也不能刪；她要改，請她告訴護理員。
B 近期事件（layer=B）：這幾天的身體狀況與心情、當下的念頭。同一件事新的取代舊的 —— 她說膝蓋好多了，就用 mode="replace" 把舊的那筆換掉，追問才會停。
C 跨日摘要：由系統整理，不要自己寫。
不保存：密碼、卡號、帳號、驗證碼；第三人的健康；對家人或員工的評價。也不要在對話中複誦。
她否定某一筆已經記得的事時用 mode="remove"，不要新增一筆相反的。提起記憶時像家人記得，不像唸資料庫；不確定就先問一句。""",
    "attitude_reminder": """先叫她的稱呼，一句講清楚時間與該做的事（藥、要帶的東西），不解釋為什麼，不催。說一次就好。""",
    "attitude_health": """先問感覺，不給建議、不說「要多注意」、不推測原因。她說好了，就用 update_memory 把那一筆換掉；她說沒好，就聽她講，不要連續追問。""",
    "attitude_chat": """從她的興趣起頭，一次一件，兩句以內。可以用「我問您喔」請教她會的事，讓她當老師。碰到「不主動提起」清單裡的事，等她自己開口。""",
}

WORKSHOP2_BLOCK_TITLES: tuple[tuple[str, str], ...] = (
    ("memory_use", "記憶使用規則"),
    ("attitude_reminder", "重要提醒怎麼講"),
    ("attitude_health", "健康關心怎麼問"),
    ("attitude_chat", "閒聊從哪裡開始"),
)
# A schema-1 project stored the old default text verbatim. If the block still
# starts with it, the student never edited it and gets the new default.
LEGACY_MEMORY_USE_PREFIX = "用 read_memory 讀取"

# The `source` values a memory entry may carry; anything else is the model's own write.
MEMORY_SOURCES: tuple[str, ...] = ("caregiver", "dodo", "system")

PROMPT_BLOCK_TITLES: tuple[tuple[str, str], ...] = (
    ("identity", "角色與身分"),
    ("personality_tone", "個性與聲音"),
    ("conversation_style", "對話方式"),
    ("language", "語言"),
    ("safety", "邊界與安全"),
)

# The 建檔 (design spec §2.1). Caregiver-written, AI read-only. Interests and
# symptoms are NOT here: the form writes them into `workspace.memory` with
# `source: caregiver`, so the memory viewer stays the single source of truth.
EMPTY_ELDER_PROFILE: dict[str, Any] = {
    "name": "",
    "address": "",
    "room": "",
    "city": "",
    "background": "",
    "language": "",
    "expertise": [],
    "wake_time": "",
    "bed_time": "",
    "routines": [],
    "medications": [],
    "appointments": [],
    "emergency_contact": {"name": "", "relation": "", "phone": ""},
    "taboos": [],
    "declined_notes": [],
}
DEFAULT_PROACTIVE_POLICY: dict[str, int] = {"interval_minutes": 30, "daily_limit": 4}
LEGACY_POLICY_KEYS: tuple[str, ...] = (
    "quiet_hours",
    "priorities",
    "cooldown_minutes",
    "daily_message_limit",
    "max_message_sentences",
)


def prompt_blocks_for(agent: dict[str, Any]) -> dict[str, str]:
    """Return all editable prompt blocks, including defaults for legacy projects.

    A *missing* key means a project file that predates the block, so the default
    fills in. An *empty* value means the student deleted that block on purpose
    and it stays empty — `compose_agent_prompt` then omits the whole section.
    """

    supplied = agent.get("prompt_blocks")
    if not isinstance(supplied, dict):
        supplied = {}
    return {
        key: (str(supplied[key]).strip() if key in supplied else default)
        for key, default in DEFAULT_PROMPT_BLOCKS.items()
    }


def compose_agent_prompt(agent: dict[str, Any]) -> str:
    """Assemble the read-only preview and the exact instructions sent to OpenAI."""

    replacements = {
        "{AGENT_NAME}": str(agent.get("name") or "豆豆"),
        "{USER_ADDRESS}": str(agent.get("address") or "王奶奶"),
    }
    blocks = prompt_blocks_for(agent)
    sections: list[str] = []
    for key, title in PROMPT_BLOCK_TITLES:
        content = blocks[key]
        if not content:
            continue  # student cleared this block — drop the whole section
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        sections.append(f"# {title}\n{content}")
    return "\n\n".join(sections)


def workshop2_blocks_for(profile: dict[str, Any]) -> dict[str, str]:
    """Same missing-vs-empty rule as `prompt_blocks_for`, for Workshop 2.

    Keys the current schema does not know (the schema-1 `proactive` block) are
    dropped: the three attitude boxes replaced it and its prose cannot be split.
    """

    supplied = profile.get("workshop2_blocks")
    if not isinstance(supplied, dict):
        supplied = {}
    blocks = {
        key: (str(supplied[key]).strip() if key in supplied else default)
        for key, default in WORKSHOP2_PROMPT_BLOCKS.items()
    }
    if blocks["memory_use"].startswith(LEGACY_MEMORY_USE_PREFIX):
        blocks["memory_use"] = WORKSHOP2_PROMPT_BLOCKS["memory_use"]
    return blocks


# ---------------------------------------------------------------------------
# Prompt assembly (generated sections live in prompt_sections.py)
# ---------------------------------------------------------------------------


def compose_workshop2_prompt(workspace: dict[str, Any]) -> str:
    """Assemble Workshop 2's half of the instructions.

    Four editable attitude blocks, then four generated sections: 長者資料 (from the
    建檔), 目前記得的事 (from memory), 不主動提起 (taboos), 主動訊息的程式規則.
    Students edit the 建檔 and the boxes, never the generated text.

    Mirrored by `buildWorkshop2Prompt` in the browser, which composes from unsaved
    field values. `tests/fixtures/workshop2_prompt.txt` pins both to the same
    output — change the fixture, not just one side.
    """

    profile = workspace.get("profile") or {}
    agent = profile.get("agent") or {}
    elder = profile.get("elder_profile") or {}
    # Both knobs defaulted once, here: `compose_rules_section` is a pure renderer
    # and the schema defaults are this module's business, not the text's.
    policy = {**DEFAULT_PROACTIVE_POLICY, **(profile.get("proactive_policy") or {})}
    address = str(elder.get("address") or agent.get("address") or "長者")
    replacements = {"{AGENT_NAME}": str(agent.get("name") or "豆豆"), "{USER_ADDRESS}": address}

    blocks = workshop2_blocks_for(profile)
    sections: list[str] = []
    for key, title in WORKSHOP2_BLOCK_TITLES:
        content = blocks[key]
        if not content:
            continue  # cleared on purpose — drop the whole section
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        sections.append(f"# {title}\n{content}")

    sections.append(compose_elder_section(elder, address))
    sections.append("# 目前記得的事（三層記憶）\n" + compose_memory_context(workspace.get("memory") or {}))
    sections.append(compose_taboo_section(elder.get("taboos") or []))
    sections.append(compose_rules_section(policy, elder))
    return "\n\n".join(sections)


def compose_full_instructions(workspace: dict[str, Any]) -> str:
    """The exact instructions the Realtime session receives: Workshop 1 + 2."""

    profile = workspace.get("profile") or {}
    parts = [
        compose_agent_prompt(profile.get("agent") or {}),
        compose_workshop2_prompt(workspace),
    ]
    return "\n\n".join(part for part in parts if part.strip())


# ---------------------------------------------------------------------------
# Workspace schema and migration
# ---------------------------------------------------------------------------

DEFAULT_WORKSPACE: dict[str, Any] = {
    "schema_version": SCHEMA_VERSION,
    "profile": {
        "agent": {
            "name": "豆豆",
            "address": "王奶奶",
            "prompt_blocks": copy.deepcopy(DEFAULT_PROMPT_BLOCKS),
            "system_prompt": "",
            "voice": DEFAULT_VOICE,
        },
        "realtime": {
            "turn_detection": {
                "type": "semantic_vad",
                "eagerness": "low",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 800,
                "create_response": True,
                "interrupt_response": True,
            },
        },
        "workshop2_blocks": copy.deepcopy(WORKSHOP2_PROMPT_BLOCKS),
        "elder_profile": copy.deepcopy(EMPTY_ELDER_PROFILE),
        "proactive_policy": dict(DEFAULT_PROACTIVE_POLICY),
    },
    "memory": {"facts": [], "events": [], "summaries": []},
    # 待提醒項目 for the Workshop 2 trigger tab. The browser ticks the real clock
    # against these, so a 提醒 set for 16:00 actually fires at 16:00 instead of
    # only ever being a number typed into a what-if field.
    "scheduled": [],
    # Real accumulated cost of the proactive messages 豆豆 has actually sent, as
    # opposed to the what-if numbers in the manual trigger. `declined_until` is
    # the 「她剛說不想聊」 button: it expires, or one press would silence her for good.
    "proactive_state": {"last_spoken_at": None, "sent_today": 0, "day": "", "declined_until": None},
    "progress": {
        "workshop_1_completed": False,
        "workshop_2_completed": False,
    },
}


def _merge_defaults(defaults: Any, value: Any) -> Any:
    if not isinstance(defaults, dict) or not isinstance(value, dict):
        return copy.deepcopy(value)
    merged = copy.deepcopy(defaults)
    for key, item in value.items():
        merged[key] = _merge_defaults(defaults.get(key), item) if key in defaults else item
    return merged


def _non_negative_int(value: Any, fallback: int) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return fallback


def _migrate_policy(raw_policy: Any, policy: dict[str, Any]) -> None:
    """cooldown → interval, daily_message_limit → daily_limit, then drop the rest.

    Reads the *raw* file, not the merged result: after `_merge_defaults` the new
    key already holds the default and a student's 60-minute cooldown would look
    identical to nobody having set anything.
    """

    raw = raw_policy if isinstance(raw_policy, dict) else {}
    if "interval_minutes" not in raw and "cooldown_minutes" in raw:
        policy["interval_minutes"] = raw["cooldown_minutes"]
    if "daily_limit" not in raw and "daily_message_limit" in raw:
        policy["daily_limit"] = raw["daily_message_limit"]
    for key in LEGACY_POLICY_KEYS:
        policy.pop(key, None)
    for key, default in DEFAULT_PROACTIVE_POLICY.items():
        policy[key] = _non_negative_int(policy.get(key), default)


def _same_entry(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return left["key"] == right["key"] and left["value"] == right["value"]


def _normalize_memory(memory: Any) -> dict[str, list[dict[str, Any]]]:
    """Every entry becomes `{key, value, source, tag, …}`; duplicates by key+value collapse.

    Legacy plain-string entries and entries without a `source` are the model's own
    writes, so they are marked `dodo`. Extra keys (`updated_at`) survive.

    `dict(raw)` copies one level, which is all this needs: the only caller is
    `normalize_workspace`, which passes the deep copy `_merge_defaults` already
    made, so no nested value here is still shared with the caller's file.
    """

    source = memory if isinstance(memory, dict) else {}
    result: dict[str, list[dict[str, Any]]] = {"facts": [], "events": [], "summaries": []}
    for layer, entries in result.items():
        for raw in source.get(layer) or []:
            entry = dict(raw) if isinstance(raw, dict) else {"value": raw}
            entry["key"] = str(entry.get("key") or "").strip()
            entry["value"] = str(entry.get("value") or "").strip()
            entry["source"] = entry.get("source") if entry.get("source") in MEMORY_SOURCES else "dodo"
            entry["tag"] = str(entry["tag"]).strip() if entry.get("tag") else None
            if not (entry["key"] or entry["value"]):
                continue
            if any(_same_entry(entry, existing) for existing in entries):
                continue
            entries.append(entry)
    return result


def _migrate_elder_profile(elder: dict[str, Any], memory: dict[str, list[dict[str, Any]]]) -> None:
    """Schema-1 `interests` become caregiver-written A facts; list fields become lists.

    Idempotent: `save_workspace` normalizes on every save, so a project must not
    grow a new 興趣 fact each time it is written.
    """

    interests = elder.pop("interests", None)
    for item in interests if isinstance(interests, list) else []:
        text = str(item).strip()
        entry = {"key": "興趣", "value": text, "tag": "interest", "source": "caregiver"}
        if text and not any(_same_entry(entry, existing) for existing in memory["facts"]):
            memory["facts"].append(entry)
    # Which fields are text and which are lists is already stated once, in
    # EMPTY_ELDER_PROFILE; a second list of names here would only drift from it.
    for field, default in EMPTY_ELDER_PROFILE.items():
        if isinstance(default, str):
            elder[field] = str(elder.get(field) or "").strip()
        elif isinstance(default, list) and not isinstance(elder.get(field), list):
            elder[field] = []
    contact = elder.get("emergency_contact")
    elder["emergency_contact"] = {
        **EMPTY_ELDER_PROFILE["emergency_contact"],
        **(contact if isinstance(contact, dict) else {}),
    }


def normalize_workspace(value: dict[str, Any] | None) -> dict[str, Any]:
    """Return a complete schema-2 workspace while preserving student customizations."""

    if value is None:
        workspace = copy.deepcopy(DEFAULT_WORKSPACE)
        workspace["profile"]["agent"]["system_prompt"] = compose_agent_prompt(
            workspace["profile"]["agent"]
        )
        return workspace
    if not isinstance(value, dict):
        raise ValueError("Dodo 專案必須是 JSON object。")
    if value.get("schema_version", 1) not in SUPPORTED_SCHEMA_VERSIONS:
        raise ValueError("目前只支援 schema_version 1 或 2。")
    workspace = _merge_defaults(DEFAULT_WORKSPACE, value)
    workspace["schema_version"] = SCHEMA_VERSION
    raw_profile = value.get("profile") if isinstance(value.get("profile"), dict) else {}
    profile = workspace["profile"]

    agent = profile["agent"]
    # Dropped on the way in, not just missing from the defaults: `_merge_defaults`
    # keeps every key the student's file carries, so an older 我的 Dodo would
    # re-export the output cap this project deliberately never sets.
    agent.pop("max_output_tokens", None)
    agent["prompt_blocks"] = prompt_blocks_for(agent)
    # Stored as Workshop 1 only, on purpose: the Workshop 2 half depends on live
    # memory and is composed at send time by `compose_full_instructions`.
    agent["system_prompt"] = compose_agent_prompt(agent)
    agent["voice"] = resolve_voice(agent.get("voice"))

    # Dead schema-1 sections, same reasoning as `max_output_tokens`.
    profile.pop("memory_policy", None)
    profile.pop("safety_policy", None)
    _migrate_policy(raw_profile.get("proactive_policy"), profile["proactive_policy"])
    # Order matters: memory is normalized first because the elder migration appends
    # 興趣 facts into it and dedupes against entries that must already be
    # `{key, value, …}` dicts. Policy is independent of both.
    workspace["memory"] = _normalize_memory(workspace.get("memory"))
    _migrate_elder_profile(profile["elder_profile"], workspace["memory"])
    profile["workshop2_blocks"] = workshop2_blocks_for(profile)
    return workspace


def load_workspace(path: Path = WORKSPACE_PATH) -> dict[str, Any]:
    if not path.exists():
        return normalize_workspace(None)
    with path.open("r", encoding="utf-8") as file:
        return normalize_workspace(json.load(file))


def save_workspace(workspace: dict[str, Any], path: Path = WORKSPACE_PATH) -> None:
    normalized = normalize_workspace(workspace)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(normalized, file, ensure_ascii=False, indent=2)
        file.write("\n")


def workshop2_starter() -> dict[str, Any]:
    """Workshop 1 done, 建檔 empty — what a student who skipped the first class loads."""

    if WORKSHOP2_STARTER_PATH.exists():
        with WORKSHOP2_STARTER_PATH.open("r", encoding="utf-8") as file:
            return normalize_workspace(json.load(file))
    workspace = normalize_workspace(None)
    workspace["progress"]["workshop_1_completed"] = True
    return workspace
