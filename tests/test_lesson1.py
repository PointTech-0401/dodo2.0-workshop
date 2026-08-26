from dodo_workshop.lesson1 import TextTurnSimulator


def test_short_pause_keeps_waiting() -> None:
    simulator = TextTurnSimulator(silence_timeout_seconds=3)
    simulator.process("/say 我今天想")

    result = simulator.process("/pause 2")

    assert result.status == "waiting"
    assert simulator.buffer == ["我今天想"]


def test_long_pause_commits_buffer() -> None:
    simulator = TextTurnSimulator(silence_timeout_seconds=3)
    simulator.process("/say 我今天想")
    simulator.process("/say 去公園走走")

    result = simulator.process("/pause 4")

    assert result.status == "respond"
    assert result.event == "long_pause"
    assert result.text == "我今天想 去公園走走"
    assert simulator.buffer == []


def test_unclear_is_a_response_event() -> None:
    result = TextTurnSimulator(3).process("/unclear 我昨天去［聽不清楚］")

    assert result.status == "respond"
    assert result.event == "unclear"

