"""打包學生用的 ZIP：根目錄直接是專案，沒有頂層資料夾。

    uv run python scripts/pack_student_zip.py [--ref REF] [--out PATH]

內容取自 git 已提交的內容（預設 HEAD，也可以給 tag），所以要先 commit 或先打 tag。
哪些檔案不進 ZIP、批次檔用什麼換行，都寫在 .gitattributes。只打包，不發佈。

GitHub 的「Download ZIP」與 Release 頁面的「Source code (zip)」都會多包一層資料夾，
學生解壓縮後再多一層，CMD 就站錯資料夾。所以給學生的是這支腳本打出來的檔案。
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import zipfile
from pathlib import Path

DEFAULT_OUT = "dist/dodo2.0-workshop.zip"

# 學生的第一步就是對 start-w1.bat（第二堂是 start-w2.bat）點兩下，缺了它們或 app.py 的 ZIP 對學生就是壞的。
REQUIRED = ("app.py", "start-w1.bat", "start-w2.bat", ".python-version")
# 舊的單一啟動檔不帶 --workshop，兩堂會開在同一個網址。它還在，學生就可能點到它。
RETIRED = ("start.bat",)
# 這些由 .gitattributes 排除；它們出現，代表規則還沒進這個 ref（多半是還沒 commit）。
DEV_ONLY_FOLDERS = ("tests/", "docs/", "slides/", "scripts/")


def _git(*args: str, cwd: Path | None = None) -> str:
    done = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True
    )
    return done.stdout.strip()


def _parse(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="打包學生用的平面版 ZIP（只打包，不發佈）")
    parser.add_argument("--ref", default="HEAD", help="要打包的 commit 或 tag，預設 HEAD")
    parser.add_argument("--out", default=DEFAULT_OUT, help=f"輸出位置，預設 {DEFAULT_OUT}（相對於倉庫根目錄）")
    args = parser.parse_args(argv)
    if args.ref.startswith("-"):
        parser.error(f"--ref 不能以 - 開頭（{args.ref}），git 會把它當成選項，不是版本。")
    return args


def _problems(ref: str, names: list[str]) -> list[str]:
    """這個 ZIP 為什麼不能給學生。空的表示可以。"""

    problems = []
    missing = [name for name in REQUIRED if name not in names]
    if missing:
        problems.append(
            f"{ref} 的根目錄缺 {', '.join(missing)}：學生解壓縮後不能點 start-w1.bat／start-w2.bat 啟動，或會多一層資料夾。是不是還沒 commit？"
        )
    retired = [name for name in RETIRED if name in names]
    if retired:
        problems.append(f"{ref} 還帶著舊的 {', '.join(retired)}：學生點到它，兩堂會開在同一個網址。要先刪掉再 commit。")
    leaked = sorted({name.split("/")[0] for name in names if name.startswith(DEV_ONLY_FOLDERS)})
    if leaked:
        problems.append(f"{ref} 帶了開發用的資料夾 {', '.join(leaked)}：.gitattributes 的排除規則沒進這個版本。是不是還沒 commit？")
    return problems


def main(argv: list[str] | None = None) -> int:
    args = _parse(argv)
    try:
        repo = Path(_git("rev-parse", "--show-toplevel"))
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("這裡不是 git 倉庫，或找不到 git。", file=sys.stderr)
        return 2

    out = Path(args.out)
    if not out.is_absolute():
        out = repo / out
    out.parent.mkdir(parents=True, exist_ok=True)

    try:
        _git("archive", "--format=zip", f"--output={out}", args.ref, cwd=repo)
    except subprocess.CalledProcessError as error:
        out.unlink(missing_ok=True)
        print(f"git archive 失敗：{error.stderr.strip()}", file=sys.stderr)
        return 2

    with zipfile.ZipFile(out) as archive:
        names = archive.namelist()
    problems = _problems(args.ref, names)
    if problems:
        out.unlink()
        print("\n".join([*problems, f"已刪除 {out.name}，不留一個會害學生卡住的 ZIP。"]), file=sys.stderr)
        return 1

    files = [name for name in names if not name.endswith("/")]
    print(f"已打包 {len(files)} 個檔案（{out.stat().st_size / 1024:.0f} KB）：{out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
