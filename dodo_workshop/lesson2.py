from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from dodo_workshop.config import load_json
from dodo_workshop.llm import TextModel
from dodo_workshop.profile import load_workspace


@dataclass(frozen=True)
class Decision:
    should_speak: bool
    reason: str
    event: dict | None = None


def is_quiet_hour(time_text: str, start: int, end: int) -> bool:
    hour = datetime.strptime(time_text, "%H:%M").hour
    if start > end:
        return hour >= start or hour < end
    return start <= hour < end


def choose_event(scenario: dict, policy: dict) -> Decision:
    events = scenario.get("events", [])
    if not events:
        return Decision(False, "沒有可處理的事件。")

    priorities = policy["priorities"]
    ranked = sorted(events, key=lambda item: priorities.get(item["type"], 0), reverse=True)
    event = ranked[0]
    critical = event["type"] == "emergency"

    if critical:
        return Decision(True, "緊急事件優先，不受一般靜音規則限制。", event)
    if scenario.get("user_declined", False):
        return Decision(False, "使用者剛拒絕互動，尊重拒絕。", event)
    if is_quiet_hour(
        scenario["time"],
        policy["quiet_hours"]["start"],
        policy["quiet_hours"]["end"],
    ):
        return Decision(False, "目前是安靜時段。", event)
    if scenario["minutes_since_last_message"] < policy["cooldown_minutes"]:
        return Decision(False, "距離上次主動訊息太近。", event)
    if scenario["messages_today"] >= policy["daily_message_limit"]:
        return Decision(False, "今日主動訊息已達上限。", event)
    return Decision(True, f"通過規則，選擇最高優先事件：{event['type']}。", event)


def build_proactive_instructions(profile: dict, policy: dict) -> str:
    return f"""
你是高齡陪伴助理豆豆。請根據事件寫一則可以直接傳給長者的繁體中文短訊息。
長者稱呼：{profile['address']}。興趣：{', '.join(profile['interests'])}。
最多 {policy['max_message_sentences']} 句，不使用標題或條列，不誇大、不診斷。
提醒要清楚；一般關心不要製造壓力；緊急事件先確認安全並請真人照護者介入。
""".strip()


def compose_fallback(event: dict, profile: dict) -> str:
    return event.get("suggested_message", f"{profile['address']}，想跟您說一件事。")


def run_memory_quiz() -> None:
    cards = load_json("scenarios/memory_cards.json")
    labels = {"A": "重要事實", "B": "近期事件", "C": "跨日摘要", "X": "不應保存"}
    score = 0
    print("\n=== 第二堂實作一：三層記憶分類 ===")
    print("請輸入 A、B、C 或 X；輸入 exit 可提前結束。\n")
    for index, card in enumerate(cards, start=1):
        print(f"{index}. {card['text']}")
        answer = input("分類 > ").strip().lstrip("\ufeffï»¿").upper()
        if answer == "EXIT":
            break
        if answer == card["answer"]:
            score += 1
            print(f"正確：{labels[answer]}。{card['explanation']}\n")
        else:
            correct = card["answer"]
            print(f"建議分類：{correct}（{labels[correct]}）。{card['explanation']}\n")
    print(f"完成，答對 {score}/{len(cards)} 題。")


def run_proactive_lab(offline: bool = False, run_all: bool = False) -> None:
    workspace = load_workspace()
    profile = workspace["profile"]["elder_profile"]
    policy = workspace["profile"]["proactive_policy"]
    scenarios = load_json("scenarios/proactive_scenarios.json")
    model = TextModel(offline=offline)

    print("\n=== 第二堂實作二：主動 Agent 決策測試 ===")
    print("修改 student/lesson2_proactive_policy.json 後重新執行，可比較結果。\n")
    for index, scenario in enumerate(scenarios, start=1):
        decision = choose_event(scenario, policy)
        print(f"[{index}] {scenario['name']}")
        print(f"輸入：時間 {scenario['time']}，事件 {[e['type'] for e in scenario['events']]}")
        print(f"決策：{'主動開口' if decision.should_speak else '保持安靜'}")
        print(f"原因：{decision.reason}")
        if decision.should_speak and decision.event:
            message = model.generate(
                build_proactive_instructions(profile, policy),
                f"事件資料：{decision.event}",
                compose_fallback(decision.event, profile),
            )
            print(f"豆豆：{message}")
        print()
        if not run_all and index < len(scenarios):
            input("按 Enter 看下一個情境...")
