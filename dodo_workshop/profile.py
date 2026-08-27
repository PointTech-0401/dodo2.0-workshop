from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from dodo_workshop.config import ROOT


WORKSPACE_PATH = ROOT / "student" / "my-dodo.json"
WORKSHOP2_STARTER_PATH = ROOT / "starter" / "workshop2-default-dodo.json"


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


# Workshop 2's own editable prompt layer. Workshop 1 decides *how* 豆豆 talks;
# these decide what it does with the elder's memory and when it may open its
# mouth first. They are appended after the Workshop 1 blocks, so the live
# session carries both — before this existed, 長者資料／三層記憶／主動規則 never
# reached the model at all and only surfaced if it happened to call read_memory.
WORKSHOP2_PROMPT_BLOCKS: dict[str, str] = {
    "memory_use": """用 read_memory 讀取 {USER_ADDRESS} 的三層記憶，用 update_memory 保存新資訊，並在保存時指定層級：
A 重要事實（layer=A）：過敏、慢性病、緊急聯絡人、長期偏好；由真人確認管理，不要自行推測或改寫。
B 近期事件（layer=B）：這幾天的狀況與心情，例如昨晚沒睡好、今天想吃什麼；可能很快改變，不要當成永久事實。
C 跨日摘要（layer=C）：跨多次對話才看得出來的趨勢，例如最近一週常提到睡不好。
X 不保存：密碼、提款卡密碼、API Key、金融帳號、驗證碼一律不保存，也不要在對話中複誦。
提起記憶時要像家人記得，而不是唸資料庫；不確定的事先問一句，不要假裝記得。""",
    "proactive": """你可以主動開口，但「主動」不等於想到就說。
安靜時段、冷卻時間與每日上限由程式規則決定，你只負責措辭；沒有收到主動事件時不要自行開啟新話題。
提醒類事件要講清楚時間與該帶的東西；一般關心不要製造壓力，也不要連續追問。
緊急事件先確認 {USER_ADDRESS} 當下是否安全，並明確說你會請真人照護者介入。""",
}

WORKSHOP2_BLOCK_TITLES: tuple[tuple[str, str], ...] = (
    ("memory_use", "記憶使用規則"),
    ("proactive", "主動關心規則"),
)

# Which workspace list feeds which memory layer, in the same A/B/C order the
# Workshop 2 quiz teaches.
MEMORY_LAYERS: tuple[tuple[str, str, str], ...] = (
    ("A", "facts", "A 重要事實"),
    ("B", "events", "B 近期事件"),
    ("C", "summaries", "C 跨日摘要"),
)
# Instructions are re-sent on every 套用, so the memory dump has to stay bounded.
MEMORY_PREVIEW_LIMIT = 8

PROMPT_BLOCK_TITLES: tuple[tuple[str, str], ...] = (
    ("identity", "角色與身分"),
    ("personality_tone", "個性與聲音"),
    ("conversation_style", "對話方式"),
    ("language", "語言"),
    ("safety", "邊界與安全"),
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
    """Same missing-vs-empty rule as `prompt_blocks_for`, for Workshop 2."""

    supplied = profile.get("workshop2_blocks")
    if not isinstance(supplied, dict):
        supplied = {}
    return {
        key: (str(supplied[key]).strip() if key in supplied else default)
        for key, default in WORKSHOP2_PROMPT_BLOCKS.items()
    }


def _memory_entry_text(entry: Any) -> str:
    """Accept both the `{key, value}` shape and legacy plain strings."""

    if isinstance(entry, dict):
        key = str(entry.get("key") or "").strip()
        value = str(entry.get("value") or "").strip()
        return f"{key}：{value}" if key and value else key or value
    return str(entry or "").strip()


def memory_layer_headings(memory_policy: dict[str, Any] | None) -> dict[str, str]:
    """Layer titles carrying their retention window.

    `memory_policy` was dead schema — present in every workspace file and read by
    nothing. Nothing ages inside a 165-minute class, so retention is surfaced as
    a label rather than simulated: 「保存 365 天」 next to 「保存 30 天」 is what
    makes A and B different in the first place.
    """

    policy = memory_policy if isinstance(memory_policy, dict) else {}
    return {
        "facts": f"A 重要事實（保存 {policy.get('fact_retention_days', 365)} 天）",
        "events": f"B 近期事件（保存 {policy.get('event_retention_days', 30)} 天）",
        "summaries": "C 跨日摘要（由多次對話整理）",
    }


def compose_memory_context(
    memory: dict[str, Any], memory_policy: dict[str, Any] | None = None
) -> str:
    """Render the three memory layers exactly as the model will receive them."""

    headings = memory_layer_headings(memory_policy)
    lines: list[str] = []
    for _, field, _short_title in MEMORY_LAYERS:
        title = headings[field]
        entries = memory.get(field) if isinstance(memory, dict) else None
        texts = [text for text in map(_memory_entry_text, entries or []) if text]
        if not texts:
            lines.append(f"{title}：（目前沒有任何記錄）")
            continue
        shown = texts[-MEMORY_PREVIEW_LIMIT:]
        omitted = len(texts) - len(shown)
        suffix = f"（另有 {omitted} 筆較舊記錄未列出）" if omitted else ""
        lines.append(f"{title}：{suffix}")
        lines.extend(f"- {text}" for text in shown)
    return "\n".join(lines)


def compose_workshop2_prompt(workspace: dict[str, Any]) -> str:
    """Assemble Workshop 2's half of the instructions.

    Two editable blocks plus three generated sections. The generated sections are
    what make 長者資料、三層記憶 and the proactive rules visible to the model —
    they are derived, so students edit the fields, not the text.

    Mirrored by `buildWorkshop2Prompt` in web/app.js (the browser composes from
    unsaved field values). The two must produce identical text; change both.
    """

    profile = workspace.get("profile") or {}
    agent = profile.get("agent") or {}
    elder = profile.get("elder_profile") or {}
    policy = profile.get("proactive_policy") or {}
    quiet = policy.get("quiet_hours") or {}
    replacements = {
        "{AGENT_NAME}": str(agent.get("name") or "豆豆"),
        # Workshop 2 is about the elder, so the placeholder resolves to the
        # elder's 稱呼 and falls back to the Workshop 1 one.
        "{USER_ADDRESS}": str(elder.get("address") or agent.get("address") or "王奶奶"),
    }
    blocks = workshop2_blocks_for(profile)
    sections: list[str] = []
    for key, title in WORKSHOP2_BLOCK_TITLES:
        content = blocks[key]
        if not content:
            continue  # cleared on purpose — drop the whole section
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        sections.append(f"# {title}\n{content}")

    interests = [str(item).strip() for item in elder.get("interests") or [] if str(item).strip()]
    elder_lines = [
        f"稱呼：{replacements['{USER_ADDRESS}']}",
        f"居住城市：{elder.get('city') or '未提供'}（問天氣沒有指定城市時用這個）",
        f"興趣：{'、'.join(interests) if interests else '未提供'}",
    ]
    sections.append("# 長者資料\n" + "\n".join(elder_lines))

    memory_context = compose_memory_context(
        workspace.get("memory") or {}, profile.get("memory_policy")
    )
    sections.append("# 目前記得的事（三層記憶）\n" + memory_context)

    priorities = policy.get("priorities") or {}
    order = "、".join(
        f"{name}({score})"
        for name, score in sorted(priorities.items(), key=lambda item: item[1], reverse=True)
    )
    policy_lines = [
        f"安靜時段：{quiet.get('start', 22):02d}:00–{quiet.get('end', 8):02d}:00（緊急事件除外）",
        f"主動訊息冷卻：{policy.get('cooldown_minutes', 30)} 分鐘",
        f"每日主動訊息上限：{policy.get('daily_message_limit', 4)} 則",
        f"每則主動訊息最多 {policy.get('max_message_sentences', 2)} 句",
        f"事件優先權：{order or '未設定'}",
        "這些條件由程式先判斷；你收到主動事件時才開口，措辭仍要符合上面的規則。",
    ]
    sections.append("# 主動訊息的程式規則\n" + "\n".join(policy_lines))
    return "\n\n".join(sections)


def compose_full_instructions(workspace: dict[str, Any]) -> str:
    """The exact instructions the Realtime session receives: Workshop 1 + 2."""

    profile = workspace.get("profile") or {}
    parts = [
        compose_agent_prompt(profile.get("agent") or {}),
        compose_workshop2_prompt(workspace),
    ]
    return "\n\n".join(part for part in parts if part.strip())


DEFAULT_WORKSPACE: dict[str, Any] = {
    "schema_version": 1,
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
        "elder_profile": {
            "name": "王美麗",
            "address": "王奶奶",
            "city": "台中",
            "interests": ["種蘭花", "烹飪", "老歌"],
        },
        "memory_policy": {
            "fact_retention_days": 365,
            "event_retention_days": 30,
            "allow_sensitive_credentials": False,
        },
        "proactive_policy": {
            "quiet_hours": {"start": 22, "end": 8},
            "cooldown_minutes": 30,
            "daily_message_limit": 4,
            "max_message_sentences": 2,
            "priorities": {
                "emergency": 100,
                "reminder": 80,
                "health": 60,
                "weather": 40,
                "reverse_mentor": 30,
                "news": 20,
            },
        },
        "safety_policy": {
            "medical_advice": "不診斷，先確認安全並建議尋求專業協助",
            "emergency": "優先確認安全並請真人照護者介入",
        },
    },
    "memory": {"facts": [], "events": [], "summaries": []},
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


def normalize_workspace(value: dict[str, Any] | None) -> dict[str, Any]:
    """Return a complete v1 workspace while preserving student customizations."""

    if value is None:
        workspace = copy.deepcopy(DEFAULT_WORKSPACE)
        workspace["profile"]["agent"]["system_prompt"] = compose_agent_prompt(
            workspace["profile"]["agent"]
        )
        return workspace
    if not isinstance(value, dict):
        raise ValueError("Dodo 專案必須是 JSON object。")
    if value.get("schema_version", 1) != 1:
        raise ValueError("目前只支援 schema_version 1。")
    workspace = _merge_defaults(DEFAULT_WORKSPACE, value)
    agent = workspace["profile"]["agent"]
    # Dropped on the way in, not just missing from the defaults: `_merge_defaults`
    # keeps every key the student's file carries, so an older 我的 Dodo would
    # re-export the output cap this project deliberately never sets.
    agent.pop("max_output_tokens", None)
    agent["prompt_blocks"] = prompt_blocks_for(agent)
    # Stored as Workshop 1 only, on purpose: the Workshop 2 half depends on live
    # memory and is composed at send time by `compose_full_instructions`.
    agent["system_prompt"] = compose_agent_prompt(agent)
    agent["voice"] = resolve_voice(agent.get("voice"))
    workspace["profile"]["workshop2_blocks"] = workshop2_blocks_for(workspace["profile"])
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
    if WORKSHOP2_STARTER_PATH.exists():
        with WORKSHOP2_STARTER_PATH.open("r", encoding="utf-8") as file:
            return normalize_workspace(json.load(file))
    workspace = normalize_workspace(None)
    workspace["progress"]["workshop_1_completed"] = True
    return workspace
