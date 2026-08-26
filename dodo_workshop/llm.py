from __future__ import annotations

import os

from dotenv import load_dotenv
from openai import OpenAI


class TextModel:
    """Small Responses API wrapper with an offline classroom fallback."""

    def __init__(self, offline: bool = False, api_key: str | None = None) -> None:
        load_dotenv()
        self.offline = offline or os.getenv("DODO_WORKSHOP_OFFLINE") == "1"
        self.model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")

    def generate(
        self,
        instructions: str,
        user_input: str | list[dict[str, str]],
        fallback: str | None = None,
        max_output_tokens: int = 180,
    ) -> str:
        if self.offline:
            if fallback is None:
                raise RuntimeError("離線模式沒有真實模型回覆。")
            return fallback
        if not self.api_key:
            raise RuntimeError(
                "找不到 OPENAI_API_KEY。請在首次啟動引導輸入，或設定 .env。"
            )
        response = OpenAI(api_key=self.api_key).responses.create(
            model=self.model,
            instructions=instructions,
            input=user_input,
            max_output_tokens=max(1, min(int(max_output_tokens), 4096)),
        )
        return response.output_text.strip()
