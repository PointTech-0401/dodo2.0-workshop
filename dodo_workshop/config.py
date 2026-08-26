from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_json(relative_path: str) -> Any:
    path = ROOT / relative_path
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)

