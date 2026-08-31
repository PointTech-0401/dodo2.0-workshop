"""The generated half of Workshop 2's prompt: 建檔 and memory rendered as text.

建檔決定資料，Prompt 只寫規範 (design spec §4). The four editable 對話規範 blocks
live in `profile.py`; everything here is *generated* — students never type it, and
每段畫面上都標著來源（來自建檔 › 作息）.

Pure rendering: dicts in, text out. Nothing here reads the workspace schema or the
filesystem, so `profile.py` can import it without a cycle. `compose_rules_section`
takes an already-defaulted policy for the same reason — the defaults are a schema
concern and are applied once, in `compose_workshop2_prompt`.

`tests/fixtures/workshop2_prompt.txt` pins this output byte-for-byte. Changing any
string here means regenerating the fixture on purpose.
"""

from __future__ import annotations

from typing import Any


MEMORY_LAYER_HEADINGS: dict[str, str] = {
    "facts": "A 重要事實（長期保存；標［護理員］的你不能改）",
    "events": "B 近期事件（會過期；同一件事新的取代舊的）",
    "summaries": "C 跨日摘要（由系統整理，不是人寫的）",
}
SOURCE_MARKERS: dict[str, str] = {"caregiver": "［護理員］", "system": "［系統］"}
# Instructions are re-sent on every 套用, so the memory dump has to stay bounded —
# but a complete 建檔 (13 caregiver facts for the reference elder) must fit whole.
MEMORY_PREVIEW_LIMIT = 16
# The one proactive rule the model executes; the program only writes it down.
MAX_MESSAGE_SENTENCES = 2
WEEKDAY_NAMES: dict[int, str] = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日"}


def _memory_entry_text(entry: Any) -> str:
    """`key：value［護理員］` — the marker tells the model which A facts it may not touch."""

    if not isinstance(entry, dict):
        return str(entry or "").strip()
    key = str(entry.get("key") or "").strip()
    value = str(entry.get("value") or "").strip()
    text = f"{key}：{value}" if key and value else key or value
    return text + SOURCE_MARKERS.get(str(entry.get("source") or ""), "") if text else ""


def compose_memory_context(memory: dict[str, Any]) -> str:
    """Render the three memory layers exactly as the model will receive them."""

    lines: list[str] = []
    for field, title in MEMORY_LAYER_HEADINGS.items():
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


def _weekdays_text(weekdays: Any) -> str:
    days = [int(day) for day in (weekdays or []) if str(day).strip()]
    return "" if not days else "週" + "、".join(WEEKDAY_NAMES.get(day, str(day)) for day in days)


def _routine_text(routine: dict[str, Any]) -> str:
    text = f"{routine.get('label') or '作息'} {routine.get('start', '')}–{routine.get('end', '')}"
    days = _weekdays_text(routine.get("weekdays"))
    return f"{text}（{days}）" if days else text


def _medication_text(medication: dict[str, Any]) -> str:
    text = f"{medication.get('time', '')} {medication.get('name') or '用藥'}".strip()
    note = str(medication.get("note") or "").strip()
    return f"{text}（{note}）" if note else text


def _appointment_text(appointment: dict[str, Any]) -> str:
    when = (
        f"每週{WEEKDAY_NAMES.get(int(appointment['weekday']), appointment['weekday'])}"
        if appointment.get("weekday")
        else str(appointment.get("date") or "")
    )
    text = f"{when} {appointment.get('time', '')} {appointment.get('label') or '回診'}".strip()
    note = str(appointment.get("note") or "").strip()
    return f"{text}（{note}）" if note else text


def compose_elder_section(elder: dict[str, Any], address: str) -> str:
    """`# 長者資料`, generated from the 建檔. The emergency phone never enters the
    prompt: it is the caregiver's, not 豆豆's."""

    lines = [f"稱呼：{address}"]
    name, room = str(elder.get("name") or "").strip(), str(elder.get("room") or "").strip()
    if name:
        lines.append(f"姓名：{name}" + (f"（房號 {room}）" if room else ""))
    elif room:
        lines.append(f"房號：{room}")
    lines.append(f"居住城市：{elder.get('city') or '未提供'}（問天氣沒有指定城市時用這個）")
    for label, key in (("語言", "language"), ("背景", "background")):
        if str(elder.get(key) or "").strip():
            lines.append(f"{label}：{str(elder[key]).strip()}")
    expertise = [str(item).strip() for item in elder.get("expertise") or [] if str(item).strip()]
    if expertise:
        lines.append("她會的事（可以請教）：" + "、".join(expertise))
    wake, bed = str(elder.get("wake_time") or "").strip(), str(elder.get("bed_time") or "").strip()
    if wake or bed:
        lines.append(f"作息：{wake or '？'} 起床、{bed or '？'} 就寢")
    quiet_routines = [r for r in elder.get("routines") or [] if r.get("do_not_disturb") and r.get("start")]
    if quiet_routines:
        lines.append("不打擾時段：" + "、".join(_routine_text(r) for r in quiet_routines))
    medications = [m for m in elder.get("medications") or [] if m.get("time") or m.get("name")]
    if medications:
        lines.append("用藥：" + "；".join(_medication_text(m) for m in medications))
    appointments = [a for a in elder.get("appointments") or [] if a.get("time") or a.get("label")]
    if appointments:
        lines.append("回診／復健：" + "；".join(_appointment_text(a) for a in appointments))
    contact = elder.get("emergency_contact") or {}
    if str(contact.get("name") or "").strip():
        relation = str(contact.get("relation") or "").strip()
        lines.append(
            f"緊急聯絡人：{relation + ' ' if relation else ''}{contact['name']}（電話由照護員保管，不要向長者複誦）"
        )
    return "# 長者資料\n" + "\n".join(lines)


def compose_taboo_section(taboos: list[dict[str, Any]]) -> str:
    """`# 不主動提起`: remembered, known to the model, never raised first.

    This is the 「AI 能否主動提起？」 question made into data. It never disappears
    from the prompt, so an empty 建檔 says so explicitly.
    """

    items = [t for t in taboos or [] if str(t.get("topic") or "").strip()]
    if not items:
        return "# 不主動提起\n（建檔沒有填。她自己提起的事都可以接著聊。）"
    return "# 不主動提起\n" + "\n".join(
        f"- {str(t['topic']).strip()}" + (f"：{str(t['rule']).strip()}" if str(t.get("rule") or "").strip() else "")
        for t in items
    )


def compose_rules_section(policy: dict[str, Any], elder: dict[str, Any]) -> str:
    """`# 主動訊息的程式規則` — stated to the model even though the program enforces them.

    `policy` already carries both knobs: the caller merges the schema defaults in.
    """

    interval, limit = int(policy["interval_minutes"]), int(policy["daily_limit"])
    wake, bed = str(elder.get("wake_time") or "").strip(), str(elder.get("bed_time") or "").strip()
    quiet_labels = [str(r.get("label") or "作息") for r in elder.get("routines") or [] if r.get("do_not_disturb")]
    lines = [
        "主動訊息分三類：重要提醒（不受任何限制、不算額度）、健康關心（追問還沒好的身體狀況）、閒聊。",
        f"健康關心與閒聊：兩則之間至少間隔 {interval} 分鐘，每天最多 {limit} 則。",
        (
            f"她的睡眠時段（{bed}–{wake}）只送重要提醒。"
            if wake and bed
            else "建檔沒有填睡眠時段，所以沒有安靜時段。"
        ),
    ]
    if quiet_labels:
        lines.append(f"不打擾時段（{'、'.join(quiet_labels)}）只送重要提醒。")
    lines.extend(
        [
            "她剛說不想聊時，健康關心與閒聊都不送。",
            f"每則主動訊息最多 {MAX_MESSAGE_SENTENCES} 句。",
            "這些條件由程式先判斷；你收到主動事件時才開口，措辭要符合上面的態度。",
        ]
    )
    return "# 主動訊息的程式規則\n" + "\n".join(lines)
