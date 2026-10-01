"""`/api/autosave`：每一堂把作品存成一個檔，Terminal 誤關後重開會問要不要載入。

兩堂各一個檔，第二堂不會問你要不要載入第一堂的東西。
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

import dodo_workshop.web as web_module
from dodo_workshop.profile import workshop2_starter
from dodo_workshop.web import WorkspaceRequest, delete_autosave, read_autosave, write_autosave


@pytest.fixture
def runtime(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setattr(web_module, "AUTOSAVE_DIR", tmp_path)
    monkeypatch.setattr(web_module, "_workshop_mode", web_module._workshop_mode)
    return tmp_path


def _as(mode: int | None) -> None:
    web_module._workshop_mode = mode


def test_nothing_saved_yet_means_nothing_to_offer(runtime: Path) -> None:
    _as(2)

    assert read_autosave() == {"workspace": None, "saved_at": None}


def test_a_save_comes_back_with_the_time_it_was_made(runtime: Path) -> None:
    _as(2)
    project = workshop2_starter()
    project["profile"]["elder_profile"]["name"] = "邱秀蘭"

    write_autosave(WorkspaceRequest(workspace=project))
    back = read_autosave()

    assert back["workspace"]["profile"]["elder_profile"]["name"] == "邱秀蘭"
    assert back["saved_at"]


def test_each_session_keeps_its_own_file(runtime: Path) -> None:
    _as(1)
    first = workshop2_starter()
    first["profile"]["agent"]["name"] = "第一堂的豆豆"
    write_autosave(WorkspaceRequest(workspace=first))
    _as(2)

    assert read_autosave()["workspace"] is None
    assert sorted(path.name for path in runtime.iterdir()) == ["workshop1-autosave.json"]


def test_starting_over_forgets_the_record(runtime: Path) -> None:
    _as(2)
    write_autosave(WorkspaceRequest(workspace=workshop2_starter()))

    delete_autosave()

    assert read_autosave()["workspace"] is None
    delete_autosave()  # nothing left to delete is not an error


def test_something_that_is_not_a_project_is_refused(runtime: Path) -> None:
    _as(2)
    with pytest.raises(HTTPException) as refused:
        write_autosave(WorkspaceRequest(workspace={"hello": "world"}))

    assert refused.value.status_code == 400
    assert not list(runtime.iterdir())


def test_a_damaged_file_is_treated_as_no_record(runtime: Path) -> None:
    _as(2)
    (runtime / "workshop2-autosave.json").write_text("{ half a fi", encoding="utf-8")

    assert read_autosave() == {"workspace": None, "saved_at": None}
