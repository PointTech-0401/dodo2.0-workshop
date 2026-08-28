"""Regenerate the golden fixture both prompt composers are pinned to.

    uv run python tests/fixtures/make_fixtures.py

`workshop2_workspace.json` is the reference 建檔 loaded into a normalized
workspace; `workshop2_prompt.txt` is what `compose_workshop2_prompt` produces for
it. `test_profile.py` checks the Python side against the text. The browser side of
the contract (design spec §4: `tests/browser/uicheck.js` feeds this same workspace
to `buildWorkshop2Prompt` and compares byte-for-byte) is not wired up yet — it
lands with the 前端 stage, and `MEMORY_PREVIEW_LIMIT` has to agree on both sides
before it can pass.

Re-run this when the generated sections change on purpose, and read the diff of
the .txt before committing it.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

# Run as a plain script, so the repo root has to be put on the path by hand.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from dodo_workshop.config import load_json  # noqa: E402
from dodo_workshop.profile import compose_workshop2_prompt, normalize_workspace  # noqa: E402

FIXTURES = Path(__file__).resolve().parent


def build_fixture_workspace() -> dict:
    reference = load_json("scenarios/reference_profile.json")
    return normalize_workspace(
        {
            "schema_version": 2,
            "profile": {"elder_profile": copy.deepcopy(reference["elder_profile"])},
            "memory": copy.deepcopy(reference["memory"]),
        }
    )


def main() -> None:
    workspace = build_fixture_workspace()
    (FIXTURES / "workshop2_workspace.json").write_text(
        json.dumps(workspace, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (FIXTURES / "workshop2_prompt.txt").write_text(compose_workshop2_prompt(workspace), encoding="utf-8")
    print("fixtures written")


if __name__ == "__main__":
    main()
