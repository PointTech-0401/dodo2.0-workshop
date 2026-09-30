"""學生拿到的 ZIP 要能解壓縮就跑：根目錄直接是專案，不多一層資料夾，也不帶開發用的東西。

在暫時的 git 倉庫裡實際跑打包腳本，看 ZIP 裡有什麼。.gitattributes 用倉庫裡真的那份，
所以有人拿掉排除規則或換行規則，這裡會壞。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import NamedTuple

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "pack_student_zip.py"
ATTRIBUTES = ROOT / ".gitattributes"

# 學生要用到的，以及不該跟著 ZIP 出去的（測試、簡報、講師文件、打包腳本自己）。
STUDENT_FILES = {
    "app.py": "print('hi')\n",
    "start-w1.bat": "@echo off\nuv run python app.py serve --workshop 1 %*\n",
    "start-w2.bat": "@echo off\nuv run python app.py serve --workshop 2 %*\n",
    "README.md": "readme\n",
    "pyproject.toml": "[project]\n",
    "uv.lock": "lock\n",
    ".python-version": "3.12\n",
    "dodo_workshop/web.py": "x\n",
    "web/index.html": "<html>\n",
    "scenarios/interview.md": "x\n",
    "starter/workshop2-default-dodo.json": "{}\n",
    "student/my-dodo.json": "{}\n",
    "runtime/.gitkeep": "",
}
DEV_ONLY_FILES = {
    "tests/test_x.py": "x\n",
    "tests/fixtures/f.txt": "x\n",
    "docs/guide.md": "x\n",
    "docs/superpowers/specs/s.md": "x\n",
    "slides/src/deck1.mjs": "x\n",
    "scripts/pack_student_zip.py": "x\n",
    "package.json": "{}\n",
    "bun.lock": "x\n",
}
STUDENT_TOP_LEVEL = {name.split("/")[0] for name in STUDENT_FILES}


class Packed(NamedTuple):
    done: subprocess.CompletedProcess[str]
    zip_path: Path


def _make_repo(tmp_path: Path, files: dict[str, str], *, attributes: bool = True) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (["init", "-q"], ["config", "user.email", "t@example.com"], ["config", "user.name", "t"],
                 # 最嚴格的情況：這台 git 完全不幫忙轉換行，換行只能靠 .gitattributes。
                 ["config", "core.autocrlf", "false"]):
        subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)
    if attributes and ATTRIBUTES.exists():
        shutil.copy(ATTRIBUTES, repo / ".gitattributes")
    for name, content in files.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content.encode("utf-8"))  # write_text 在 Windows 會把 LF 悄悄寫成 CRLF
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-q", "-m", "t"], cwd=repo, check=True, capture_output=True)
    return repo


def _pack(repo: Path, out: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--out", str(out), *args],
        cwd=repo,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )


@pytest.fixture(scope="module")
def packed(tmp_path_factory: pytest.TempPathFactory) -> Packed:
    tmp_path = tmp_path_factory.mktemp("pack")
    repo = _make_repo(tmp_path, {**STUDENT_FILES, **DEV_ONLY_FILES})
    out = tmp_path / "dist" / "student.zip"  # dist 資料夾還不存在，腳本要自己建
    return Packed(_pack(repo, out), out)


def _entries(packed: Packed) -> set[str]:
    assert packed.done.returncode == 0, packed.done.stdout + packed.done.stderr
    return set(zipfile.ZipFile(packed.zip_path).namelist())


def test_app_py_sits_at_the_zip_root(packed: Packed) -> None:
    """解壓縮後多一層資料夾，是去年學生唯一卡住的地方。"""

    names = _entries(packed)

    assert "app.py" in names
    assert {"start-w1.bat", "start-w2.bat"} <= names
    assert "start.bat" not in names


def test_zip_holds_only_what_a_student_needs(packed: Packed) -> None:
    top_level = {name.split("/")[0] for name in _entries(packed)}

    assert top_level == STUDENT_TOP_LEVEL


@pytest.mark.parametrize("launcher", ["start-w1.bat", "start-w2.bat"])
def test_launchers_keep_windows_line_endings_whatever_git_is_set_to(packed: Packed, launcher: str) -> None:
    _entries(packed)
    data = zipfile.ZipFile(packed.zip_path).read(launcher)

    assert b"\r\n" in data
    assert data.replace(b"\r\n", b"").count(b"\n") == 0  # 一個單獨的 LF 都不能有


@pytest.mark.parametrize("missing", ["app.py", "start-w1.bat", "start-w2.bat", ".python-version"])
def test_refuses_a_ref_missing_a_file_students_depend_on(tmp_path: Path, missing: str) -> None:
    """還沒 commit 就打包時，HEAD 裡沒有新加的啟動檔，腳本卻照樣印「已打包」，學生拿到就斷在第 3 步。"""

    repo = _make_repo(tmp_path, {name: text for name, text in STUDENT_FILES.items() if name != missing})
    out = tmp_path / "bad.zip"

    done = _pack(repo, out)

    assert done.returncode != 0
    assert missing in done.stderr
    assert not out.exists()


def test_refuses_a_ref_that_still_carries_the_old_launcher(tmp_path: Path) -> None:
    """舊的 start.bat 不帶 --workshop：學生點到它，兩堂開在同一個網址，第二堂就接著第一堂的資料。"""

    repo = _make_repo(tmp_path, {**STUDENT_FILES, "start.bat": "@echo off\nuv run python app.py serve %*\n"})
    out = tmp_path / "bad.zip"

    done = _pack(repo, out)

    assert done.returncode != 0
    assert "start.bat" in done.stderr
    assert not out.exists()


def test_refuses_a_ref_that_has_no_exclusion_rules_yet(tmp_path: Path) -> None:
    """.gitattributes 還沒 commit 時，測試、簡報、講師文件會全部跟著進學生的 ZIP。"""

    repo = _make_repo(tmp_path, {**STUDENT_FILES, **DEV_ONLY_FILES}, attributes=False)
    out = tmp_path / "bad.zip"

    done = _pack(repo, out)

    assert done.returncode != 0
    assert "tests" in done.stderr  # 點名是哪個資料夾漏出去
    assert not out.exists()


def test_rejects_a_ref_that_git_would_read_as_an_option(tmp_path: Path) -> None:
    """--ref=--list 會被 git 當成選項，不是版本；要在動任何檔案之前就講清楚，而不是丟出一串錯誤。"""

    repo = _make_repo(tmp_path, STUDENT_FILES)
    earlier = tmp_path / "keep.zip"
    earlier.write_bytes(b"an earlier build")

    done = _pack(repo, earlier, "--ref=--list")

    assert done.returncode != 0
    assert "Traceback" not in done.stderr
    assert earlier.read_bytes() == b"an earlier build"


def test_refuses_a_zip_that_would_unpack_with_an_extra_folder(tmp_path: Path) -> None:
    repo = _make_repo(tmp_path, {"dodo2.0-workshop/app.py": "x\n", "dodo2.0-workshop/start-w1.bat": "x\n"})
    out = tmp_path / "bad.zip"

    done = _pack(repo, out)

    assert done.returncode != 0
    assert "app.py" in done.stderr
    assert not out.exists()  # 不留一個會害學生卡住的 ZIP
