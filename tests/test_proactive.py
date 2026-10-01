"""The new proactive engine: schedule from 作息, three types, two knobs, one day.

The sweep tests at the bottom are the exercise's whole point, encoded: no policy
gets both scores to zero, the default is on the frontier (so students cannot
「beat」 it on both axes), and the default still misses one follow-up so the
squeeze — 早上閒聊花掉的額度，下午拿不回來 — is visible on the projector.
"""

from typing import Any

import pytest

from dodo_workshop.config import load_json
from dodo_workshop.proactive import (
    CHAT_SLOTS,
    HEALTH_SLOTS,
    Schedule,
    Window,
    build_day,
    build_schedule,
    choose_event,
    dominators,
    simulate_day,
    sweep_policies,
)

REFERENCE = load_json("scenarios/reference_profile.json")
PROFILE = REFERENCE["elder_profile"]
MEMORY = REFERENCE["memory"]
TUESDAY = REFERENCE["simulated_weekday"]
DEFAULT = {"interval_minutes": 30, "daily_limit": 4}
OPEN_ALL_DAY = Schedule(quiet=None, dnd=(), wake=0)


def scenario(**overrides: Any) -> dict[str, Any]:
    base = {"time": "10:00", "type": "chat", "minutes_since_last": 600, "sent_today": 0, "user_declined": False}
    return {**base, **overrides}


# --- schedule ---------------------------------------------------------------


def test_quiet_window_wraps_midnight_and_uses_minutes_not_hours() -> None:
    schedule = build_schedule(PROFILE, TUESDAY)

    assert schedule.quiet == Window("睡眠時段", 21 * 60 + 30, 5 * 60)
    for minute, expected in ((23 * 60, True), (4 * 60 + 59, True), (5 * 60, False), (21 * 60 + 29, False), (21 * 60 + 30, True)):
        assert schedule.quiet.contains(minute) is expected, minute


def test_same_bed_and_wake_time_means_no_quiet_window() -> None:
    assert build_schedule({**PROFILE, "bed_time": "22:00", "wake_time": "22:00"}, TUESDAY).quiet is None


def test_do_not_disturb_windows_follow_the_weekday() -> None:
    tuesday = {window.label for window in build_schedule(PROFILE, 2).dnd}
    wednesday = {window.label for window in build_schedule(PROFILE, 3).dnd}

    assert "歌唱班" in tuesday and "歌唱班" not in wednesday
    assert {"早餐", "午餐", "午睡", "晚餐", "八點檔"} <= wednesday
    assert "走廊運動" not in tuesday  # not ticked as 不打擾


def test_a_window_can_cross_midnight() -> None:
    late_show = Window("夜間節目", 23 * 60, 1 * 60)

    assert late_show.contains(23 * 60 + 30) and late_show.contains(30)
    assert not late_show.contains(2 * 60)


# --- choose_event -----------------------------------------------------------


def test_reminders_skip_every_gate() -> None:
    schedule = build_schedule(PROFILE, TUESDAY)
    decision = choose_event(
        scenario(type="reminder", time="23:00", minutes_since_last=1, sent_today=99, user_declined=True),
        {"interval_minutes": 600, "daily_limit": 0},
        schedule,
    )

    assert decision.should_speak and decision.rule == "reminder"


def test_rules_apply_in_order_and_name_what_blocked() -> None:
    schedule = build_schedule(PROFILE, TUESDAY)

    assert choose_event(scenario(user_declined=True, time="23:00"), DEFAULT, schedule).rule == "declined"
    early = choose_event(scenario(time="04:30"), DEFAULT, schedule)
    late = choose_event(scenario(time="22:00"), DEFAULT, schedule)
    assert (early.rule, early.reason) == ("quiet", "她還沒起床")
    assert (late.rule, late.reason) == ("quiet", "她已經睡了")
    nap = choose_event(scenario(time="13:00"), DEFAULT, schedule)
    assert (nap.rule, nap.reason) == ("dnd", "她在午睡")
    assert choose_event(scenario(minutes_since_last=10), DEFAULT, schedule).rule == "interval"
    assert choose_event(scenario(sent_today=4), DEFAULT, schedule).rule == "limit"
    assert choose_event(scenario(), DEFAULT, schedule).rule == "speak"


def test_interval_is_strictly_less_than() -> None:
    """07:30 追問 is exactly 30 minutes after the 07:00 藥 and has to pass at 30."""

    assert choose_event(scenario(minutes_since_last=30), DEFAULT, OPEN_ALL_DAY).should_speak
    assert not choose_event(scenario(minutes_since_last=29), DEFAULT, OPEN_ALL_DAY).should_speak


# --- build_day --------------------------------------------------------------


def test_tuesday_grows_out_of_the_reference_file() -> None:
    day = build_day(PROFILE, MEMORY, TUESDAY)

    reminders = [event for event in day if event["type"] == "reminder"]
    health = [event for event in day if event["type"] == "health"]
    chats = [event for event in day if event["type"] == "chat"]
    assert [event["time"] for event in reminders] == ["07:00", "21:00"]  # no 復健／回診 on Tuesday
    assert [event["time"] for event in health] == list(HEALTH_SLOTS)
    assert [event["key"] for event in health] == ["膝蓋", "頭暈", "睡眠"]
    assert len(chats) == len(CHAT_SLOTS)
    assert [event["time"] for event in chats if event["user_declined"]] == ["18:30"]
    assert [event["time"] for event in day] == sorted(event["time"] for event in day)
    assert any("歌唱班" in event["topic"] for event in chats)


def test_a_reminder_sharing_a_minute_with_a_follow_up_goes_first() -> None:
    """A student who writes 09:00 藥 collides with the 09:00 追問 slot. The
    reminder is the one that cannot be skipped, so it is said first."""

    nine_o_clock_pill = {**PROFILE, "medications": [{"name": "血糖藥", "time": "09:00", "note": ""}]}
    day = build_day(nine_o_clock_pill, MEMORY, TUESDAY)

    assert [event["type"] for event in day if event["time"] == "09:00"] == ["reminder", "health"]


def test_appointments_only_appear_on_their_day_thirty_minutes_early() -> None:
    wednesday = [event for event in build_day(PROFILE, MEMORY, 3) if event["source"] == "appointment"]
    friday = [event for event in build_day(PROFILE, MEMORY, 5) if event["source"] == "appointment"]

    assert [(event["time"], event["topic"]) for event in wednesday] == [("09:00", "09:30 復健（膝蓋電療、熱敷）")]
    assert friday[0]["time"] == "08:30" and "新陳代謝科" in friday[0]["topic"]  # 2026-10-09 is a Friday


def test_a_thin_file_still_produces_a_day() -> None:
    day = build_day({"wake_time": "06:00", "bed_time": "22:00"}, {"facts": [], "events": []}, TUESDAY)

    assert not [event for event in day if event["type"] in {"reminder", "health"}]
    assert len(day) == len(CHAT_SLOTS)
    assert all(event["topic"] for event in day)


# --- simulate_day -----------------------------------------------------------


def test_default_day_misses_one_follow_up_and_every_rule_fires_once() -> None:
    schedule = build_schedule(PROFILE, TUESDAY)
    result = simulate_day(build_day(PROFILE, MEMORY, TUESDAY), DEFAULT, schedule)

    assert (result["missed_health"], result["noise"]) == (1, 2)
    assert result["health_total"] == 3 and result["chat_total"] == len(CHAT_SLOTS)
    assert set(result["blocked_by"]) == {"declined", "quiet", "dnd", "interval", "limit"}
    by_time = {step["time"]: step for step in result["steps"]}
    assert by_time["16:30"]["rule"] == "limit"  # the squeeze
    assert by_time["07:30"]["spoke"] and by_time["09:00"]["spoke"]
    assert all(by_time[time]["spoke"] for time in ("07:00", "21:00"))


def test_reminders_reset_the_interval_but_do_not_spend_the_budget() -> None:
    feed = [
        {"time": "07:00", "type": "reminder", "topic": "藥"},
        {"time": "07:20", "type": "chat", "topic": "太近"},
        {"time": "08:00", "type": "chat", "topic": "剛好"},
    ]
    result = simulate_day(feed, {"interval_minutes": 30, "daily_limit": 1}, OPEN_ALL_DAY)

    assert [step["rule"] for step in result["steps"]] == ["reminder", "interval", "speak"]
    assert result["noise"] == 1


GRID_INTERVALS = (0, 10, 15, 20, 25, 30, 35, 45, 60, 90, 120, 180, 240, 600)
GRID_LIMITS = range(0, 13)


@pytest.fixture(scope="module")
def sweep():
    schedule = build_schedule(PROFILE, TUESDAY)
    return sweep_policies(build_day(PROFILE, MEMORY, TUESDAY), schedule, GRID_INTERVALS, GRID_LIMITS)


def test_no_policy_is_perfect(sweep) -> None:
    assert (0, 0) not in sweep.values()


def test_the_default_is_on_the_frontier(sweep) -> None:
    """If a student finds a policy better on both axes, the default teaches the
    wrong lesson (「間隔調大是免費的」). Re-tune the slots if this ever fails."""

    assert sweep[(30, 4)] == (1, 2)
    assert dominators(sweep, (30, 4)) == []


def test_tightening_and_loosening_each_lose_one_axis(sweep) -> None:
    default = sweep[(30, 4)]
    tight, loose = sweep[(30, 2)], sweep[(0, 12)]

    assert tight[0] > default[0] and tight[1] < default[1]
    assert loose[0] < default[0] and loose[1] > default[1]
    assert loose[0] == 0


def test_only_widening_the_interval_loses_on_both_axes(sweep) -> None:
    """The anti-lesson: the interval blocks the follow-up right after the 藥, not the chat."""

    assert sweep[(60, 4)] == (2, 3)
    assert (30, 4) in dominators(sweep, (60, 4))


# --- a 建檔 typed by a student ------------------------------------------------


def test_an_empty_file_has_no_quiet_window_of_its_own() -> None:
    """Nothing typed means nothing derived: the band stays blank until she has a bedtime."""

    schedule = build_schedule({}, TUESDAY)

    assert schedule.quiet is None and schedule.dnd == () and schedule.wake == 0
    assert build_schedule({"wake_time": "05:00"}, TUESDAY).quiet is None  # half a pair is still nothing


def test_malformed_times_drop_the_row_instead_of_the_day() -> None:
    sloppy = {
        "wake_time": "早上五點",
        "bed_time": "21:30",
        "routines": [{"label": "午睡", "start": "12:30", "end": "兩點", "do_not_disturb": True}],
        "medications": [{"name": "藥", "time": "7:00"}, {"name": "壞的", "time": "25:00"}],
        "appointments": [{"label": "回診", "weekday": "星期三", "time": "09:00"}],
    }

    schedule = build_schedule(sloppy, TUESDAY)
    assert schedule.quiet is None and schedule.dnd == ()
    day = build_day(sloppy, {"facts": [], "events": []}, 3)
    assert [event["time"] for event in day if event["type"] == "reminder"] == ["7:00"]

def test_the_fixed_gates_lose_on_both_axes_for_her() -> None:
    """The 對照 claim: the production gates (22:00–08:00 plus meals) are worse on
    BOTH axes for her, which is the whole argument for deriving them from 作息.

    跑她的一天 left the classroom on 2026-10-01, so the docs no longer print the
    four-row table this used to check them against; the engine claim stays."""

    from dodo_workshop.web import DODO_FIXED_SCHEDULE

    feed = build_day(PROFILE, MEMORY, TUESDAY)
    schedule = build_schedule(PROFILE, TUESDAY)
    hers = simulate_day(feed, {"interval_minutes": 30, "daily_limit": 4}, schedule)
    fixed = simulate_day(feed, {"interval_minutes": 30, "daily_limit": 4}, DODO_FIXED_SCHEDULE)
    assert fixed["missed_health"] > hers["missed_health"]
    assert fixed["noise"] > hers["noise"]
