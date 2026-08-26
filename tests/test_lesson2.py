from dodo_workshop.lesson2 import choose_event, is_quiet_hour, simulate_day
from dodo_workshop.config import load_json


POLICY = {
    "quiet_hours": {"start": 22, "end": 8},
    "cooldown_minutes": 30,
    "daily_message_limit": 4,
    "priorities": {"emergency": 100, "reminder": 80, "news": 20},
}


def scenario(**overrides):
    base = {
        "time": "15:00",
        "minutes_since_last_message": 60,
        "messages_today": 1,
        "user_declined": False,
        "events": [{"type": "news", "topic": "一般新聞"}],
    }
    base.update(overrides)
    return base


def test_quiet_hours_cross_midnight() -> None:
    assert is_quiet_hour("23:00", 22, 8)
    assert is_quiet_hour("07:30", 22, 8)
    assert not is_quiet_hour("12:00", 22, 8)


def test_news_is_suppressed_during_quiet_hours() -> None:
    decision = choose_event(scenario(time="23:00"), POLICY)

    assert not decision.should_speak


def test_emergency_overrides_all_normal_limits() -> None:
    decision = choose_event(
        scenario(
            time="02:00",
            minutes_since_last_message=1,
            messages_today=10,
            user_declined=True,
            events=[{"type": "emergency", "topic": "跌倒"}],
        ),
        POLICY,
    )

    assert decision.should_speak
    assert decision.event["type"] == "emergency"


def test_highest_priority_event_wins() -> None:
    decision = choose_event(
        scenario(
            events=[
                {"type": "news", "topic": "新聞"},
                {"type": "reminder", "topic": "回診"},
            ]
        ),
        POLICY,
    )

    assert decision.should_speak
    assert decision.event["type"] == "reminder"


def test_default_policy_passes_all_classroom_scenarios() -> None:
    policy = load_json("student/my-dodo.json")["profile"]["proactive_policy"]
    scenarios = load_json("scenarios/proactive_scenarios.json")

    for item in scenarios:
        decision = choose_event(item, policy)
        assert decision.should_speak == item["expected"]["should_speak"]
        if decision.should_speak:
            assert decision.event["type"] == item["expected"]["event_type"]


def day_policy(**overrides):
    policy = load_json("student/my-dodo.json")["profile"]["proactive_policy"]
    return {**policy, **overrides}


def test_one_day_has_no_perfect_policy() -> None:
    """This is the exercise's whole point, encoded.

    The 6 fixed scenarios have a 6/6 answer key, so students converge on the
    instructor's answer. A day has no such answer: tightening the rules trades
    打擾 for 漏掉重要事, and the feed is authored so that both directions cost
    something. If this test ever passes trivially — default scoring 0 noise, or
    strict missing nothing — the feed stopped teaching and needs re-tuning.
    """

    feed = load_json("scenarios/day_timeline.json")

    default = simulate_day(feed, day_policy())
    strict = simulate_day(
        feed,
        day_policy(
            quiet_hours={"start": 21, "end": 9}, cooldown_minutes=60, daily_message_limit=3
        ),
    )
    loose = simulate_day(
        feed,
        day_policy(
            quiet_hours={"start": 0, "end": 0}, cooldown_minutes=0, daily_message_limit=20
        ),
    )

    # The safe default loses nothing important, but is not silent either.
    assert default["missed_critical"] == 0
    assert default["noise"] >= 1
    # Over-tightening drops something that mattered (the morning 血壓藥).
    assert strict["missed_critical"] >= 1
    # Removing the rules buys that back at the cost of a pestering day.
    assert loose["missed_critical"] == 0
    assert loose["noise"] > default["noise"]


def test_emergency_survives_every_budget_in_a_full_day() -> None:
    feed = load_json("scenarios/day_timeline.json")

    # One message a day, quiet around the clock, and the user just refused.
    result = simulate_day(
        feed, day_policy(quiet_hours={"start": 0, "end": 23}, daily_message_limit=1)
    )
    emergencies = [step for step in result["steps"] if step["event_type"] == "emergency"]

    assert emergencies and all(step["spoke"] for step in emergencies)


def test_a_day_carries_cooldown_and_budget_forward() -> None:
    """The per-scenario test cannot show this: each scenario starts clean, so an
    optional message spent in the morning never costs the evening reminder."""

    feed = [
        {
            "time": "09:00",
            "importance": "optional",
            "event": {"type": "news", "topic": "早上的新聞"},
        },
        {
            "time": "09:10",
            "importance": "critical",
            "event": {"type": "reminder", "topic": "十分鐘後要吃藥"},
        },
    ]
    result = simulate_day(feed, day_policy(cooldown_minutes=30))

    assert result["steps"][0]["spoke"] is True
    # Blocked by a cooldown the first message started — not by its own merits.
    assert result["steps"][1]["spoke"] is False
    assert "太近" in result["steps"][1]["reason"]
    assert result["missed_critical"] == 1
    assert result["noise"] == 1
