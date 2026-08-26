from dodo_workshop.lesson2 import choose_event, is_quiet_hour
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
