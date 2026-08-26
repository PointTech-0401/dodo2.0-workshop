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
一次只問一件事，避免連續追問；回答要適合直接朗讀，不使用表格。""",
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


DEFAULT_WORKSPACE: dict[str, Any] = {
    "schema_version": 1,
    "profile": {
        "agent": {
            "name": "豆豆",
            "address": "王奶奶",
            "prompt_blocks": copy.deepcopy(DEFAULT_PROMPT_BLOCKS),
            "system_prompt": "",
            "voice": DEFAULT_VOICE,
            "max_output_tokens": 180,
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
    agent["prompt_blocks"] = prompt_blocks_for(agent)
    agent["system_prompt"] = compose_agent_prompt(agent)
    agent["voice"] = resolve_voice(agent.get("voice"))
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
