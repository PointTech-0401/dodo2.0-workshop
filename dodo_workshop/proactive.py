"""Workshop 2's proactive engine: three event types, two knobs, one schedule.

程式決定說不說，模型決定怎麼說。 Everything in here is deterministic and needs no
API key, so the classroom main line survives a dead network.

- `build_schedule` turns the elder's 作息 (from 建檔) into the quiet window and the
  do-not-disturb windows. Students never type quiet hours; they type when she
  sleeps and eats.
- `choose_event` is the whole rule set, in the order it is applied. Each refusal
  carries a rule code so the UI can tally 「哪一條規則擋了幾次」 without matching
  Chinese substrings.
- `build_day` grows one 星期二 out of a 建檔: medications become 重要提醒, B-layer
  symptoms become 健康關心, interests become 閒聊.
- `simulate_day` walks that day and reports the two numbers that pull against
  each other: 該追問卻沒問 and 閒聊打擾.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from datetime import date
from typing import Any, Iterable, Sequence

EVENT_TYPES: dict[str, str] = {
    "reminder": "重要提醒",
    "health": "健康關心",
    "chat": "閒聊",
}

# Decision rule codes, in evaluation order; `speak` is the fall-through. This is
# the code → 中文 table: `simulate_day` counts blocks by code, and the UI turns
# those codes into 「哪一條規則擋了幾次」 without matching Chinese substrings. The
# four blocking rules say something more specific in `Decision.reason` (「她在午睡」),
# so their label here is only ever the generic name of the rule.
RULE_LABELS: dict[str, str] = {
    "reminder": "重要提醒不受限制",
    "declined": "她剛說不想聊",
    "quiet": "安靜時段",
    "dnd": "不打擾時段",
    "interval": "間隔",
    "limit": "每日上限",
    "speak": "通過規則",
}

# Fixed candidate slots for the simulated day. The chat slots are placed so that
# every blocking rule fires at least once on the default 30/4 policy, and so that
# 「只把間隔調大」 costs the 07:30 follow-up that sits right after the 07:00 藥.
# See the design spec §3.3–3.4; `tests/test_proactive.py` sweeps the grid.
HEALTH_SLOTS: tuple[str, ...] = ("07:30", "09:00", "16:30")
CHAT_SLOTS: tuple[tuple[str, str, bool], ...] = (
    ("05:30", "weather", False),
    ("05:50", "interest", False),
    ("07:20", "news", False),
    ("08:00", "routine", False),
    ("08:15", "weather", False),
    ("10:00", "expertise", False),
    ("12:45", "news", False),
    ("14:30", "routine", False),
    ("15:10", "weather", False),
    ("17:10", "news", False),
    ("18:30", "expertise", True),
    ("20:30", "news", False),
    ("21:45", "goodnight", False),
)
APPOINTMENT_LEAD_MINUTES = 30
# 「歌唱班快開始了」 vs 「今天 15:00 有歌唱班」: two hours ahead is close enough to
# call it 快開始了, and far enough that the 08:00 格 still previews the afternoon.
ROUTINE_SOON_MINUTES = 120
WEATHER_LINES: tuple[str, ...] = ("天亮了，今天可能下雨", "天氣轉涼，記得加件外套", "下午會出太陽")


def minutes_of_day(text: str) -> int:
    hour, _, minute = str(text).partition(":")
    return int(hour) * 60 + int(minute or 0)


_HHMM = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")


def parse_hhmm(text: Any) -> int | None:
    """Minutes past midnight for a well-formed HH:MM, else None.

    Everything the *student* types goes through here: a 建檔 with 「早上七點」 in a
    time field must lose that one row, not 500 the whole day.
    """

    value = str(text or "").strip()
    return minutes_of_day(value) if _HHMM.match(value) else None


def format_minutes(total: int) -> str:
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


@dataclass(frozen=True)
class Window:
    """A daily window in minutes; `start > end` means it wraps past midnight."""

    label: str
    start: int
    end: int

    def contains(self, minute: int) -> bool:
        if self.start == self.end:
            return False
        if self.start < self.end:
            return self.start <= minute < self.end
        return minute >= self.start or minute < self.end


@dataclass(frozen=True)
class Schedule:
    """One 作息 read, shared by the simulated day and the real clock (spec §3.1).

    `wake` repeats `quiet.end` when there is a quiet window, and is the only copy
    when there is not (`bed == wake`). It stays its own field because 起床時間 is
    also the cap on `declined_until` (§2.3), which has to work on a 建檔 with no
    quiet window — deriving it from `quiet` would make that case unanswerable.
    """

    quiet: Window | None
    dnd: tuple[Window, ...]
    wake: int


def _applies_today(weekdays: Any, weekday: int) -> bool:
    days = [int(day) for day in (weekdays or []) if str(day).strip()]
    return not days or weekday in days


def build_schedule(elder_profile: dict[str, Any], weekday: int) -> Schedule:
    """Quiet = 睡眠時段（就寢→起床）; do-not-disturb = every routine ticked, for today.

    `weekday` is ISO (Monday=1 … Sunday=7). Routines with an empty `weekdays`
    list apply every day. No quiet window until *both* times are filled in — an
    empty 建檔 must not quietly inherit anyone's bedtime — and `bed == wake` also
    means none. Rows with a malformed time are skipped, never raised.
    """

    wake = parse_hhmm(elder_profile.get("wake_time"))
    bed = parse_hhmm(elder_profile.get("bed_time"))
    quiet = Window("睡眠時段", bed, wake) if wake is not None and bed is not None and bed != wake else None
    dnd = []
    for routine in elder_profile.get("routines") or []:
        start, end = parse_hhmm(routine.get("start")), parse_hhmm(routine.get("end"))
        if routine.get("do_not_disturb") and start is not None and end is not None:
            if _applies_today(routine.get("weekdays"), weekday):
                dnd.append(Window(str(routine.get("label") or "作息"), start, end))
    return Schedule(quiet=quiet, dnd=tuple(dnd), wake=wake or 0)


@dataclass(frozen=True)
class Decision:
    should_speak: bool
    rule: str
    reason: str


def choose_event(scenario: dict[str, Any], policy: dict[str, Any], schedule: Schedule) -> Decision:
    """The rule set, in order. Reminders skip every gate; everything else queues.

    `minutes_since_last < interval` is strictly less-than on purpose: the 07:30
    follow-up is exactly 30 minutes after the 07:00 藥 and must pass at 30.
    """

    event_type = str(scenario.get("type") or "chat")
    if event_type == "reminder":
        return Decision(True, "reminder", RULE_LABELS["reminder"])
    if scenario.get("user_declined"):
        return Decision(False, "declined", RULE_LABELS["declined"])

    minute = minutes_of_day(scenario["time"])
    if schedule.quiet and schedule.quiet.contains(minute):
        return Decision(False, "quiet", "她還沒起床" if minute < schedule.wake else "她已經睡了")
    for window in schedule.dnd:
        if window.contains(minute):
            return Decision(False, "dnd", f"她在{window.label}")

    interval = int(policy.get("interval_minutes", 30))
    since = int(scenario.get("minutes_since_last", 24 * 60))
    if since < interval:
        return Decision(False, "interval", f"距上一句才 {since} 分鐘（間隔 {interval}）")
    limit = int(policy.get("daily_limit", 4))
    sent = int(scenario.get("sent_today", 0))
    if sent >= limit:
        return Decision(False, "limit", f"今天已經 {sent} 則（上限 {limit}）")
    return Decision(True, "speak", f"{RULE_LABELS['speak']}：{EVENT_TYPES.get(event_type, event_type)}")


# ---------------------------------------------------------------------------
# Growing one day out of a 建檔
# ---------------------------------------------------------------------------


def _memory_values(memory: dict[str, Any], layer: str, tags: Iterable[str]) -> list[dict[str, Any]]:
    wanted = set(tags)
    return [
        entry
        for entry in (memory.get(layer) or [])
        if isinstance(entry, dict) and entry.get("tag") in wanted and str(entry.get("value") or "").strip()
    ]


def _cycle(pool: Sequence[str], index: int, fallback: str) -> str:
    """Nth item, wrapping. The fallback is for a 建檔 that filled nothing in."""

    return pool[index % len(pool)] if pool else fallback


def _appointment_is_today(appointment: dict[str, Any], weekday: int) -> bool:
    """Weekly appointments carry `weekday` (ISO), one-offs carry `date`. Garbage in either → not today."""

    try:
        if appointment.get("weekday"):
            return int(appointment["weekday"]) == weekday
        if appointment.get("date"):
            return date.fromisoformat(str(appointment["date"])).isoweekday() == weekday
    except (TypeError, ValueError):
        return False
    return False


def reminder_events(profile: dict[str, Any], weekday: int) -> list[dict[str, Any]]:
    """Today's 重要提醒 for one 建檔. Public because `intake.missing_reminders`
    compares a student's against the reference's, and must derive both the same way."""

    events = []
    for medication in profile.get("medications") or []:
        if parse_hhmm(medication.get("time")) is None:
            continue
        note = str(medication.get("note") or "").strip()
        topic = str(medication.get("name") or "用藥")
        events.append(
            {
                "time": medication["time"],
                "type": "reminder",
                "source": "medication",
                "topic": f"{topic}（{note}）" if note else topic,
            }
        )
    for appointment in profile.get("appointments") or []:
        when = parse_hhmm(appointment.get("time"))
        if when is not None and _appointment_is_today(appointment, weekday):
            events.append(
                {
                    "time": format_minutes(when - APPOINTMENT_LEAD_MINUTES),
                    "type": "reminder",
                    "source": "appointment",
                    "topic": f"{appointment['time']} {appointment.get('label') or '回診'}",
                }
            )
    return events


def _health_events(memory: dict[str, Any]) -> list[dict[str, Any]]:
    """One follow-up per symptom, into the three fixed slots.

    `zip` truncates on purpose: a 建檔 with five symptoms still gets three
    follow-ups, because the slot table is what the 30／4 sweep was tuned against.
    """

    symptoms = _memory_values(memory, "events", ("symptom",))
    return [
        {
            "time": slot,
            "type": "health",
            "source": "symptom",
            "key": str(symptom.get("key") or ""),
            "topic": f"追問「{symptom.get('key') or symptom['value']}」還好嗎",
        }
        for slot, symptom in zip(HEALTH_SLOTS, symptoms)
    ]


def _routine_line(routines: list[dict[str, Any]], slot_minute: int, index: int) -> str:
    if not routines:
        return "今天有什麼安排嗎"
    routine = routines[index % len(routines)]
    start = minutes_of_day(routine["start"])
    label = routine.get("label") or "活動"
    soon = 0 <= start - slot_minute <= ROUTINE_SOON_MINUTES
    return f"{label}快開始了" if soon else f"今天 {routine['start']} 有{label}"


def _chat_events(profile: dict[str, Any], memory: dict[str, Any], weekday: int) -> list[dict[str, Any]]:
    interests = [str(entry["value"]) for entry in _memory_values(memory, "facts", ("interest", "preference"))]
    expertise = [str(item).strip() for item in profile.get("expertise") or [] if str(item).strip()]
    # Only routines pinned to certain 星期 are chat material: 早餐 happens every
    # day and is not news, 歌唱班 on a Tuesday is.
    activities = [
        routine
        for routine in profile.get("routines") or []
        if routine.get("weekdays") and routine.get("start") and _applies_today(routine["weekdays"], weekday)
    ]
    counters: dict[str, int] = {}
    events = []
    for slot, kind, declined in CHAT_SLOTS:
        index = counters.get(kind, 0)
        counters[kind] = index + 1
        if kind == "weather":
            topic = _cycle(WEATHER_LINES, index, "今天天氣還可以")
        elif kind == "interest":
            topic = f"聊聊「{_cycle(interests, index, '她喜歡的事')}」"
        elif kind == "news":
            # +1 so 新聞 opens on a different 興趣 than the 05:50 閒聊 just used.
            topic = f"新聞：跟「{_cycle(interests, index + 1, '長者')}」有關的消息"
        elif kind == "routine":
            topic = _routine_line(activities, minutes_of_day(slot), index)
        elif kind == "expertise":
            topic = f"請教：{_cycle(expertise, index, '她會的事')}"
        else:
            topic = "晚安，明天見"
        events.append({"time": slot, "type": "chat", "source": kind, "topic": topic, "user_declined": declined})
    return events


def _event_order(event: dict[str, Any]) -> tuple[int, bool]:
    """By the clock; on a tie 重要提醒 goes first.

    Ties are reachable from a student's 建檔 — 09:00 藥 lands on a 健康關心 slot.
    Reminders are not optional, so they are said first; the follow-up sharing that
    minute then faces the 間隔 rule against the reminder just spoken. `simulate_day`
    sorts by this too, so the order does not depend on the caller having used
    `build_day` (or on the sort being stable).
    """

    return minutes_of_day(event["time"]), event.get("type") != "reminder"


def build_day(profile: dict[str, Any], memory: dict[str, Any], weekday: int = 2) -> list[dict[str, Any]]:
    """One scripted day, derived from the 建檔 rather than a hand-written JSON.

    The default is a Tuesday: 歌唱班 is on, 復健 (Wednesday) and the 回診 (a
    Friday) are off, so the whole class sees the same day when they run the
    reference 建檔.
    """

    events = reminder_events(profile, weekday) + _health_events(memory) + _chat_events(profile, memory, weekday)
    return sorted(events, key=_event_order)


# ---------------------------------------------------------------------------
# Walking the day
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DayStep:
    time: str
    type: str
    topic: str
    spoke: bool
    rule: str
    reason: str
    user_declined: bool


def simulate_day(feed: list[dict[str, Any]], policy: dict[str, Any], schedule: Schedule) -> dict[str, Any]:
    """Walk one day, letting `choose_event` decide event by event.

    Cooldown and the daily budget carry forward: a chat spent at 08:00 is a slot
    the 16:30 follow-up no longer has. Reminders move `last_spoken` (she was just
    spoken to) but never consume the budget — they are a separate system in dodo.
    """

    steps: list[DayStep] = []
    last_spoken: int | None = None
    sent = 0
    for event in sorted(feed, key=_event_order):
        now = minutes_of_day(event["time"])
        decision = choose_event(
            {
                "time": event["time"],
                "type": event.get("type", "chat"),
                "minutes_since_last": 24 * 60 if last_spoken is None else now - last_spoken,
                "sent_today": sent,
                "user_declined": bool(event.get("user_declined")),
            },
            policy,
            schedule,
        )
        if decision.should_speak:
            last_spoken = now
            if event.get("type") != "reminder":
                sent += 1
        steps.append(
            DayStep(
                time=event["time"],
                type=str(event.get("type", "chat")),
                topic=str(event.get("topic", "")),
                spoke=decision.should_speak,
                rule=decision.rule,
                reason=decision.reason,
                user_declined=bool(event.get("user_declined")),
            )
        )

    blocked_by: dict[str, int] = {}
    for step in steps:
        if not step.spoke:
            blocked_by[step.rule] = blocked_by.get(step.rule, 0) + 1
    return {
        "steps": [asdict(step) for step in steps],
        "spoken": sum(1 for step in steps if step.spoke),
        "blocked": sum(1 for step in steps if not step.spoke),
        "missed_health": sum(1 for step in steps if step.type == "health" and not step.spoke),
        "health_total": sum(1 for step in steps if step.type == "health"),
        "noise": sum(1 for step in steps if step.type == "chat" and step.spoke),
        "chat_total": sum(1 for step in steps if step.type == "chat"),
        "blocked_by": blocked_by,
    }


def sweep_policies(
    feed: list[dict[str, Any]],
    schedule: Schedule,
    intervals: Sequence[int],
    limits: Sequence[int],
) -> dict[tuple[int, int], tuple[int, int]]:
    """(interval, limit) → (missed_health, noise) for every combination."""

    results: dict[tuple[int, int], tuple[int, int]] = {}
    for interval in intervals:
        for limit in limits:
            day = simulate_day(feed, {"interval_minutes": interval, "daily_limit": limit}, schedule)
            results[(interval, limit)] = (day["missed_health"], day["noise"])
    return results


def dominators(results: dict[tuple[int, int], tuple[int, int]], target: tuple[int, int]) -> list[tuple[int, int]]:
    """Policies that are at least as good on both scores and strictly better on one."""

    missed, noise = results[target]
    return [
        policy
        for policy, (other_missed, other_noise) in results.items()
        if other_missed <= missed and other_noise <= noise and (other_missed, other_noise) != (missed, noise)
    ]
