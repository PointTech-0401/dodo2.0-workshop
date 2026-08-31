"""建檔 helpers: how complete is the student's file, and what did they miss.

Deliberately small. The classroom does not grade the 建檔 — the consequences
(她的一天, 豆豆's own answers) do. These two functions are the only automated
feedback: a count per section, and the reminders the reference 建檔 has that the
student's does not.
"""

from __future__ import annotations

from typing import Any

from dodo_workshop.proactive import reminder_events

COMPLETENESS_LABELS: dict[str, str] = {
    "medications": "用藥",
    "routines": "作息",
    "symptoms": "症狀",
    "interests": "興趣與偏好",
    "taboos": "只能她自己提",
    "declined_notes": "決定不記",
    "emergency_contact": "緊急聯絡人",
}


def _count(profile: dict[str, Any], memory: dict[str, Any], section: str) -> int:
    if section == "symptoms":
        return sum(1 for entry in memory.get("events") or [] if isinstance(entry, dict) and entry.get("tag") == "symptom")
    if section == "interests":
        return sum(
            1
            for entry in memory.get("facts") or []
            if isinstance(entry, dict) and entry.get("tag") in {"interest", "preference"}
        )
    if section == "emergency_contact":
        contact = profile.get("emergency_contact") or {}
        return 1 if str(contact.get("name") or "").strip() else 0
    return len([item for item in profile.get(section) or [] if item])


def completeness(
    profile: dict[str, Any], memory: dict[str, Any], expected: dict[str, int]
) -> list[dict[str, Any]]:
    """Counts only. Whether the content is right is answered by the day, not here."""

    rows: list[dict[str, Any]] = []
    for section, target in expected.items():
        have = _count(profile, memory, section)
        rows.append(
            {
                "section": section,
                "label": COMPLETENESS_LABELS.get(section, section),
                "have": have,
                "expected": int(target),
                "done": have >= int(target),
            }
        )
    return rows


def missing_reminders(
    student_profile: dict[str, Any], reference_profile: dict[str, Any], weekday: int
) -> list[dict[str, Any]]:
    """Reference reminders whose time the student's 建檔 has nothing for.

    Matched by time only: a student who wrote 「安眠藥」 at 21:00 has the reminder
    even if the reference says 「安眠藥半顆」. The consequence line is the point —
    「參考建檔 21:00 有安眠藥半顆，你的沒有 → 她今晚沒吃藥」.
    """

    student_times = {event["time"] for event in reminder_events(student_profile, weekday)}
    return [
        {"time": event["time"], "topic": event["topic"], "source": event["source"]}
        for event in reminder_events(reference_profile, weekday)
        if event["time"] not in student_times
    ]
