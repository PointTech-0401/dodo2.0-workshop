"""start-w1.bat／start-w2.bat 是學生點兩下用的入口，一堂一個。

去年唯一出過的狀況：ZIP 解壓後多一層資料夾，CMD 站在錯的資料夾，指令全部找不到專案。
所以啟動檔要做到：從哪裡點，都站在自己所在的資料夾。uv 是外部工具，這裡用一個會把
「在哪個資料夾、被怎麼呼叫」寫下來的假 uv 站在 PATH 最前面，只看啟動檔自己的行為。
兩個檔只差 --workshop 後面那個數字，所以每個測試兩個檔都跑一次。
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# 啟動檔 → 它帶給 app.py 的 --workshop。
LAUNCHERS = {"start-w1.bat": "1", "start-w2.bat": "2"}

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="批次檔只在 Windows 上跑")

_SYSTEM_ROOT = os.environ.get("SystemRoot", r"C:\Windows")
# 只留 cmd 與 where 找得到的地方。開發機上真的 uv 也在 PATH，不拿掉就測不到 fallback。
_BARE_PATH = os.pathsep.join([os.path.join(_SYSTEM_ROOT, "System32"), _SYSTEM_ROOT])


@pytest.fixture(params=sorted(LAUNCHERS))
def launcher(request: pytest.FixtureRequest) -> Path:
    return ROOT / request.param


def _fake_uv(folder: Path) -> Path:
    """在 folder 放一個 uv.cmd，它只做一件事：記下自己站在哪、拿到什麼參數。"""

    folder.mkdir(parents=True, exist_ok=True)
    log = folder / "uv-called.txt"
    (folder / "uv.cmd").write_text(f'@echo off\r\n(echo %CD%& echo %*) > "{log}"\r\n', encoding="ascii")
    return log


def _launch(
    tmp_path: Path, bat: Path, *args: str, uv: str | None
) -> tuple[subprocess.CompletedProcess[bytes], list[str] | None]:
    """從一個不相干的資料夾啟動 bat。

    uv 放哪裡：「path」在 PATH 上；「home」只在使用者資料夾的 .local\\bin（uv 剛裝完、
    視窗的 PATH 還沒更新的情況）；None 是哪裡都沒有。回傳 (執行結果, 假 uv 記下的兩行)。
    """

    bin_dir, home, elsewhere = tmp_path / "bin", tmp_path / "home", tmp_path / "elsewhere"
    for folder in (bin_dir, home, elsewhere):
        folder.mkdir()
    log = None
    if uv == "path":
        log = _fake_uv(bin_dir)
    elif uv == "home":
        log = _fake_uv(home / ".local" / "bin")
    env = {
        **os.environ,
        "PATH": os.pathsep.join([str(bin_dir), _BARE_PATH]) if uv == "path" else _BARE_PATH,
        "USERPROFILE": str(home),
    }
    done = subprocess.run(
        ["cmd", "/c", str(bat), *args],
        cwd=elsewhere,
        env=env,
        input=b"\r\n",  # 讓 pause 收到「任意鍵」
        capture_output=True,
        timeout=30,
    )
    called = log.read_text(encoding="ascii").splitlines() if log and log.exists() else None
    return done, called


def _output(done: subprocess.CompletedProcess[bytes]) -> str:
    raw = done.stdout + done.stderr
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("mbcs", errors="replace")  # cmd 自己的錯誤訊息用系統字碼頁，不是 UTF-8


def test_the_old_single_launcher_is_gone() -> None:
    """舊的 start.bat 不帶 --workshop，點到它兩堂會開在同一個網址，第二堂就不是乾淨的開始。"""

    assert not (ROOT / "start.bat").exists()


def test_uv_runs_from_the_folder_holding_the_launcher(tmp_path: Path, launcher: Path) -> None:
    """不論從哪裡點（捷徑、以系統管理員身分執行時都會站在 System32），都要站對資料夾。"""

    done, called = _launch(tmp_path, launcher, uv="path")

    assert called is not None, _output(done)
    assert Path(called[0]).samefile(ROOT)


@pytest.mark.parametrize(
    ("extra_args", "expected_tail"),
    [
        ((), ""),
        (("--no-browser", "--port", "8765"), " --no-browser --port 8765"),
    ],
)
def test_server_command_names_its_session_and_takes_extra_arguments(
    tmp_path: Path, launcher: Path, extra_args: tuple[str, ...], expected_tail: str
) -> None:
    """每個檔帶自己那一堂的 --workshop；巡場的人還是可以加 --port 換埠、加 --no-browser，不用改檔案。"""

    done, called = _launch(tmp_path, launcher, *extra_args, uv="path")

    assert called is not None, _output(done)
    assert called[1].strip() == f"run python app.py serve --workshop {LAUNCHERS[launcher.name]}{expected_tail}"


@pytest.mark.parametrize("uv", ["path", None])
def test_cmd_never_reports_an_error_of_its_own(tmp_path: Path, launcher: Path, uv: str | None) -> None:
    """學生不該在黑視窗裡看到「XXX 不是內部或外部命令」這種紅字，那是批次檔自己壞了。

    cmd 的錯誤一律走 stderr，不管系統語言是什麼。這個測試抓的是「一定會壞」的寫法：打錯字、
    括號沒跳脫。批次檔放中文加 chcp 65001 那種是「有時候才壞」（實測 20 次約 1 次），這個測試
    會漏過去，交給下面的 ASCII 守衛。
    """

    done, _ = _launch(tmp_path, launcher, uv=uv)

    assert done.stderr == b"", _output(done)


def test_launcher_stays_plain_ascii(launcher: Path) -> None:
    """批次檔放中文加 chcp 65001，cmd 解析位置會隨機偏掉：某一行 echo 被切成兩段，後半段被當成
    指令執行，還把「上課期間不要關視窗」那句吃掉。實測 20 次約 1 次，所以上一個測試不可靠。

    直接守住根本原因：批次檔裡不放多位元組字元。給學生看的中文交給 README 與程式本身
    （程式印出的「已啟動」那一行不經過 cmd 的解析）。
    """

    assert launcher.read_bytes().isascii()


def test_hands_the_callers_folder_back_when_it_gives_up(tmp_path: Path, launcher: Path) -> None:
    """從已經開著的終端機執行，找不到 uv 停下來之後，終端機不該被留在專案資料夾裡。"""

    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    wrapper = tmp_path / "wrapper.cmd"
    wrapper.write_text(f'@echo off\r\ncd /d "{elsewhere}"\r\ncall "{launcher}"\r\ncd\r\n', encoding="ascii")
    env = {**os.environ, "PATH": _BARE_PATH, "USERPROFILE": str(tmp_path / "home")}

    done = subprocess.run(["cmd", "/c", str(wrapper)], env=env, input=b"\r\n", capture_output=True, timeout=30)

    folder_after = _output(done).strip().splitlines()[-1]
    assert Path(folder_after).samefile(elsewhere)


def test_finds_uv_in_its_default_install_folder_when_path_is_stale(tmp_path: Path, launcher: Path) -> None:
    """uv 剛裝完，當下這個視窗的 PATH 還沒更新，點啟動檔也要能用。"""

    done, called = _launch(tmp_path, launcher, uv="home")

    assert called is not None, _output(done)


def test_explains_and_stops_when_uv_is_not_installed(tmp_path: Path, launcher: Path) -> None:
    done, called = _launch(tmp_path, launcher, uv=None)

    assert called is None
    assert done.returncode == 1, _output(done)
    # 中英各一行。中文那行在不同主機的字碼頁下可能亂碼，英文那行是保底。
    assert "uv was not found" in _output(done)
