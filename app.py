from __future__ import annotations

import argparse

from dodo_workshop.lesson1 import run_lesson1
from dodo_workshop.lesson2 import run_memory_quiz, run_proactive_lab


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="dodo 2.0 Workshop 共用客端")
    subparsers = parser.add_subparsers(dest="command")

    for command, help_text in (
        ("serve", "啟動共用瀏覽器客端"),
        ("init", "重新執行首次啟動引導"),
    ):
        web = subparsers.add_parser(command, help=help_text)
        web.add_argument("--host", default="127.0.0.1")
        web.add_argument("--port", type=int, default=8000)
        web.add_argument("--no-browser", action="store_true", help="不要自動開啟瀏覽器")

    lesson1 = subparsers.add_parser("lesson1", help="文字模擬語音 Agent 回合控制")
    lesson1.add_argument("--offline", action="store_true", help="不呼叫 OpenAI API")

    subparsers.add_parser("lesson2-memory", help="三層記憶分類挑戰")

    lesson2 = subparsers.add_parser("lesson2-agent", help="主動 Agent 情境測試")
    lesson2.add_argument("--offline", action="store_true", help="不呼叫 OpenAI API")
    lesson2.add_argument("--all", action="store_true", help="不等待 Enter，連續跑完情境")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command in {None, "serve", "init"}:
        from dodo_workshop.web import run_server

        run_server(
            host=getattr(args, "host", "127.0.0.1"),
            port=getattr(args, "port", 8000),
            open_browser=not getattr(args, "no_browser", False),
            init=args.command == "init",
        )
    elif args.command == "lesson1":
        run_lesson1(offline=args.offline)
    elif args.command == "lesson2-memory":
        run_memory_quiz()
    elif args.command == "lesson2-agent":
        run_proactive_lab(offline=args.offline, run_all=args.all)


if __name__ == "__main__":
    main()
