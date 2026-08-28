"""The reference 建檔 is the answer key for scenarios/interview.md.

Everything downstream (the shared 星期二 timeline, the completeness list, the
「參考有、你沒有」 reminder diff) derives from it, so these tests pin the planted
items to the transcript rather than trusting that the two files drift together.

分工：這裡只管**答案卷本身**——形狀合不合規格、內容追不追得回訪談稿。
用這份資料跑出來的行為（她的一天、兩個分數、掃描前緣）歸 test_proactive.py。
"""

import re

from dodo_workshop.config import ROOT, load_json

REFERENCE = load_json("scenarios/reference_profile.json")
INTERVIEW = (ROOT / "scenarios" / "interview.md").read_text(encoding="utf-8")

# 設計規格 §2.1 的建檔欄位。階段 2 的 elder_profile schema 照這份寫，
# 所以多一個或少一個都要先改規格，不能只改 JSON。
ELDER_PROFILE_KEYS = {
    "name", "address", "room", "city", "background", "language", "expertise",
    "wake_time", "bed_time", "routines", "medications", "appointments",
    "emergency_contact", "taboos", "declined_notes",
}
# §2.1 的分層規則：興趣／偏好／醫囑 → facts，症狀／短期念頭 → events。
FACT_TAGS = {"interest", "preference", "medical_note"}
EVENT_TAGS = {"symptom", "note"}
# 完整度清單的六區＋緊急聯絡人（§1）。加一區要同時加 intake 的計數方式。
COMPLETENESS_SECTIONS = {
    "medications", "routines", "symptoms", "interests",
    "taboos", "declined_notes", "emergency_contact",
}

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def hhmm(text: str) -> int:
    """Validate HH:MM and return minutes past midnight.

    刻意不從 proactive.py import `minutes_of_day`：那支是產品的解析行為，
    這裡驗的是答案卷的資料格式（「5:00」「25:00」要當場擋下來）。
    """

    assert _HHMM.match(text), text
    hour, _, minute = text.partition(":")
    return int(hour) * 60 + int(minute)


def test_elder_profile_has_exactly_the_fields_the_schema_will_have() -> None:
    """§2.1 是階段 2 的 schema 來源，欄位對不上就等於規格對不上。"""

    assert set(REFERENCE["elder_profile"]) == ELDER_PROFILE_KEYS
    assert set(REFERENCE["elder_profile"]["emergency_contact"]) == {"name", "relation", "phone"}
    assert REFERENCE["simulated_weekday"] in range(1, 8)


def test_reference_meets_its_own_completeness_counts() -> None:
    profile = REFERENCE["elder_profile"]
    expected = REFERENCE["expected_counts"]
    facts, events = REFERENCE["memory"]["facts"], REFERENCE["memory"]["events"]

    assert set(expected) == COMPLETENESS_SECTIONS
    assert len(profile["medications"]) >= expected["medications"]
    assert len(profile["routines"]) >= expected["routines"]
    assert sum(1 for item in events if item["tag"] == "symptom") >= expected["symptoms"]
    assert sum(1 for item in facts if item["tag"] in {"interest", "preference"}) >= expected["interests"]
    assert len(profile["taboos"]) >= expected["taboos"]
    assert len(profile["declined_notes"]) >= expected["declined_notes"]
    assert profile["emergency_contact"]["name"]


def test_schedule_fields_are_well_formed() -> None:
    profile = REFERENCE["elder_profile"]

    hhmm(profile["wake_time"])
    hhmm(profile["bed_time"])
    for routine in profile["routines"]:
        assert hhmm(routine["start"]) < hhmm(routine["end"]), routine["label"]
        assert set(routine["weekdays"]) <= set(range(1, 8)), routine["label"]
    for medication in profile["medications"]:
        hhmm(medication["time"])
    for appointment in profile["appointments"]:
        hhmm(appointment["time"])
        # 每週固定的復健給 weekday，單次的回診給 date，不會兩個都有。
        assert ("weekday" in appointment) != ("date" in appointment), appointment["label"]


def test_the_projector_day_is_a_tuesday() -> None:
    """全班看同一天：有歌唱班、沒有復健與回診、兩則用藥提醒。"""

    profile = REFERENCE["elder_profile"]
    tuesday = REFERENCE["simulated_weekday"]

    assert tuesday == 2
    assert (profile["wake_time"], profile["bed_time"]) == ("05:00", "21:30")
    singing = next(item for item in profile["routines"] if item["label"] == "歌唱班")
    assert singing["weekdays"] == [2, 4] and singing["do_not_disturb"]
    assert [item["time"] for item in profile["medications"]] == ["07:00", "21:00"]
    rehab = next(item for item in profile["appointments"] if "weekday" in item)
    assert rehab["weekday"] != tuesday


def test_every_seeded_memory_item_matches_the_layer_it_sits_in() -> None:
    """§2.2 的項目形狀，外加「哪個 tag 該放哪一層」的分層規則。"""

    for layer, allowed in (("facts", FACT_TAGS), ("events", EVENT_TAGS)):
        for item in REFERENCE["memory"][layer]:
            assert set(item) == {"key", "value", "tag", "source"}, item
            assert item["source"] == "caregiver", item
            assert item["tag"] in allowed, item
            assert item["key"] and item["value"], item


def test_planted_items_are_actually_in_the_transcript() -> None:
    """錨點只能挑逐字出現的詞。

    答案卷有整理過的欄位——`name` 是「邱秀蘭」但訪談稿只講「秀蘭阿嬤」、
    `background` 寫「客家人」、禁區寫「臥床」而阿嬤說的是「中風躺了六年」——
    所以這串是手工維護的橋，不能改成從答案卷自動長出來。
    """

    profile = REFERENCE["elder_profile"]

    for anchor in (
        profile["address"],
        profile["room"],
        profile["city"],
        profile["emergency_contact"]["name"],
        "新陳代謝科",
        "復健",
        "歌唱班",
        "八點檔",
        "安眠藥",
        "掌聲響起",
        "九層塔",
        "鹹粥",
        "少甜",
        "中風",
        "存摺",
        "阿桂",
    ):
        assert anchor in INTERVIEW, anchor
    # The phone number is deliberately not transcribed, so it cannot be in the key.
    assert profile["emergency_contact"]["phone"] == ""


def test_the_ambiguous_sweet_is_only_a_discussion_item() -> None:
    """偷吃糖、「不要跟護理師講」刻意沒有標準答案：不記、也不算「決定不記」。

    比對整句而不是「糖」一個字——血糖藥、少甜都是合法內容，不該誤報。
    """

    assert REFERENCE["discussion"]
    assert "不要跟護理師講" in REFERENCE["discussion"][0]["text"]
    assert REFERENCE["discussion"][0]["note"]
    for layer in ("facts", "events"):
        for item in REFERENCE["memory"][layer]:
            assert "偷吃" not in item["value"] and "不要跟護理師講" not in item["value"], item
    # 阿桂那條偷吃糖在不記清單裡是對的；阿嬤自己這句連不記清單都不能進。
    assert all("不要跟護理師講" not in note["text"] for note in REFERENCE["elder_profile"]["declined_notes"])


def test_transcript_declares_itself_fictional() -> None:
    front_matter = INTERVIEW.split("\n---", 1)[0]

    assert "虛構人物" in front_matter
