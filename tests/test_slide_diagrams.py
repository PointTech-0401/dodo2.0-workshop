"""簡報的架構圖上寫了檔名。檔案改名、搬走，或圖上列的模組其實網頁後端沒用，圖就默默說謊。

08-28 把 app.js 拆成 core／workshop1／workshop2，圖上還留著 app.js。lesson1.py 是命令列
備援，web.py 沒有 import 它，圖卻把它列在後端底下。圖自己對不了自己，所以這裡拿檔案系統
和 web.py 真正的 import 去對。
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIAGRAMS = (ROOT / "slides" / "src" / "diagrams.mjs").read_text(encoding="utf-8")
WEB_PY = (ROOT / "dodo_workshop" / "web.py").read_text(encoding="utf-8")

# 圖上只寫檔名（沒寫資料夾）時，就到這幾個資料夾裡找。
SEARCH_FOLDERS = ("", "dodo_workshop", "web", "student", "scenarios", "starter")
FILE_NAME = re.compile(r"(?<![\w/.-])((?:[\w-]+/)*[\w-]+\.(?:py|js|json))(?![\w])")
NODE = re.compile(r"dnode\(\{(.*?)\}\)", re.S)


def _exists(name: str) -> bool:
    folders = ("",) if "/" in name else SEARCH_FOLDERS
    return any((ROOT / folder / name).is_file() for folder in folders)


def test_every_file_a_diagram_names_exists() -> None:
    named = sorted(set(FILE_NAME.findall(DIAGRAMS)))

    assert named, "沒抓到任何檔名：正規表示式或圖的寫法變了"
    assert [name for name in named if not _exists(name)] == []


def test_modules_listed_under_the_backend_are_ones_web_py_imports() -> None:
    listed: dict[str, set[str]] = {}
    for body in NODE.findall(DIAGRAMS):
        title = re.search(r"title:\s*'([^']*)'", body)
        lines = re.search(r"lines:\s*\[(.*?)\]", body, re.S)
        if title and lines and title.group(1).startswith("dodo_workshop/"):
            listed[title.group(1)] = set(re.findall(r"(\w+)\.py", lines.group(1)))
    imported = set(re.findall(r"^from dodo_workshop\.(\w+) import", WEB_PY, re.M))

    assert listed, "沒找到「dodo_workshop/」開頭的後端節點：圖的寫法變了"
    for title, modules in listed.items():
        assert modules <= imported, f"{title} 底下列了 web.py 沒用的模組：{sorted(modules - imported)}"
