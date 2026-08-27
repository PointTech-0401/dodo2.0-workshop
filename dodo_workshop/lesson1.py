from __future__ import annotations

from dataclasses import dataclass

from dodo_workshop.llm import TextModel
from dodo_workshop.profile import compose_agent_prompt, load_workspace


@dataclass(frozen=True)
class TurnResult:
    status: str
    message: str
    text: str | None = None
    event: str = "normal"


class TextTurnSimulator:
    """Turns text commands into observable voice-style turn events."""

    def __init__(self, silence_timeout_seconds: float) -> None:
        self.silence_timeout_seconds = silence_timeout_seconds
        self.buffer: list[str] = []

    def process(self, line: str) -> TurnResult:
        line = line.strip()
        if not line:
            return TurnResult("waiting", "請輸入內容。")

        command, _, value = line.partition(" ")
        if command == "/say":
            if not value.strip():
                return TurnResult("waiting", "用法：/say 文字")
            self.buffer.append(value.strip())
            return TurnResult("waiting", f"已收到片段，目前緩衝：{' '.join(self.buffer)}")

        if command == "/pause":
            try:
                seconds = float(value)
            except ValueError:
                return TurnResult("waiting", "用法：/pause 秒數")
            if not self.buffer:
                return TurnResult("waiting", "目前沒有等待送出的文字片段。")
            if seconds < self.silence_timeout_seconds:
                return TurnResult(
                    "waiting",
                    f"等待中：{seconds:g} 秒尚未超過 {self.silence_timeout_seconds:g} 秒門檻。",
                )
            return self._commit("long_pause", "長停頓被判定為一個完整回合。")

        if command == "/done":
            if not self.buffer:
                return TurnResult("waiting", "目前沒有等待送出的文字片段。")
            return self._commit("manual_commit", "使用者主動結束這一回合。")

        if command == "/unclear":
            if not value.strip():
                return TurnResult("waiting", "用法：/unclear 聽到的片段")
            return TurnResult("respond", "含有辨識不清的內容。", value.strip(), "unclear")

        if command == "/interrupt":
            if not value.strip():
                return TurnResult("waiting", "用法：/interrupt 插話內容")
            return TurnResult("respond", "使用者在豆豆說話時插話。", value.strip(), "interruption")

        if command == "/reset":
            self.buffer.clear()
            return TurnResult("reset", "已清除尚未送出的片段。")

        return TurnResult("respond", "一般文字回合。", line, "normal")

    def _commit(self, event: str, message: str) -> TurnResult:
        text = " ".join(self.buffer)
        self.buffer.clear()
        return TurnResult("respond", message, text, event)


def build_voice_instructions(persona: dict) -> str:
    return compose_agent_prompt(persona)


def fallback_reply(text: str, event: str, persona: dict) -> str:
    address = persona["address"]
    if event == "unclear":
        return f"{address}，我剛才有一小段沒看清楚，可以再說一次嗎？"
    if event == "interruption":
        return f"好，{address}，我先停下來聽你說。"
    return f"{address}，我有聽到你說：「{text}」。你想再多說一點嗎？"


def run_lesson1(offline: bool = False) -> None:
    workspace = load_workspace()
    persona = workspace["profile"]["agent"]
    realtime = workspace["profile"]["realtime"]["turn_detection"]
    simulator = TextTurnSimulator(realtime["silence_duration_ms"] / 1000)
    model = TextModel(offline=offline)
    history: list[str] = []

    print("\n=== 第一堂：文字模擬 Realtime Voice Agent ===")
    print("直接輸入文字，或使用 /say、/pause、/done、/unclear、/interrupt、/reset。")
    print("輸入 exit 結束。\n")

    while True:
        line = input("你 > ").strip().lstrip("\ufeffï»¿")
        if line.lower() in {"exit", "quit"}:
            break
        result = simulator.process(line)
        print(f"[事件] {result.message}")
        if result.status != "respond" or result.text is None:
            continue

        transcript = "\n".join(history[-6:])
        model_input = (
            f"最近對話：\n{transcript or '（無）'}\n\n"
            f"本次事件：{result.event}\n使用者文字：{result.text}"
        )
        reply = model.generate(
            build_voice_instructions(persona),
            model_input,
            fallback_reply(result.text, result.event, persona),
        )
        print(f"豆豆 > {reply}\n")
        history.extend([f"使用者：{result.text}", f"豆豆：{reply}"])
