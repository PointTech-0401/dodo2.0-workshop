"""建檔 feedback: counts per section, and the reminders the reference has that the
student's file lacks. Not a grade — the consequences (豆豆's own answers)
do the grading; these two are the only automated hints."""

from dodo_workshop.config import load_json
from dodo_workshop.intake import completeness, missing_reminders

REFERENCE = load_json("scenarios/reference_profile.json")
PROFILE = REFERENCE["elder_profile"]
MEMORY = REFERENCE["memory"]
TUESDAY = REFERENCE["simulated_weekday"]


def test_reference_satisfies_completeness_and_an_empty_file_does_not() -> None:
    expected = REFERENCE["expected_counts"]

    assert all(row["done"] for row in completeness(PROFILE, MEMORY, expected))
    empty = completeness({}, {"facts": [], "events": []}, expected)
    assert not any(row["done"] for row in empty)
    assert {row["section"] for row in empty} == set(expected)
    assert all(row["have"] == 0 for row in empty)


def test_missing_reminders_are_matched_by_time_only() -> None:
    forgot_bedtime = {**PROFILE, "medications": [PROFILE["medications"][0]]}
    renamed = {**PROFILE, "medications": [{"name": "安眠藥", "time": "21:00"}, {"name": "藥", "time": "07:00"}]}

    missing = missing_reminders(forgot_bedtime, PROFILE, TUESDAY)
    assert [(item["time"], item["source"]) for item in missing] == [("21:00", "medication")]
    assert "安眠藥" in missing[0]["topic"]
    assert missing_reminders(renamed, PROFILE, TUESDAY) == []
    assert missing_reminders({}, PROFILE, TUESDAY)[0]["time"] == "07:00"
