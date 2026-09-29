"""README 最上面「給學生」那一段，學生會照著做。段落裡點名要找的檔案，必須真的在專案根目錄。

去年學生唯一卡住的是解壓縮後多一層資料夾，安裝單第一步就是叫他們確認「直接看得到 app.py」。
如果檔案改名而安裝單沒跟著改，學生會照著找一個不存在的檔案。
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_the_student_sheet_only_names_files_that_exist() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    section = re.search(r"^## 給學生[^\n]*\n(.*?)(?=^## )", readme, re.S | re.M)

    assert section, "README 最上面要有一段「## 給學生…」"
    named = sorted(set(re.findall(r"`([\w.-]+\.(?:bat|py))`", section.group(1))))
    assert named, "給學生那一段沒有點名任何檔案，學生無從確認自己站對了資料夾"
    assert [name for name in named if not (ROOT / name).is_file()] == []
