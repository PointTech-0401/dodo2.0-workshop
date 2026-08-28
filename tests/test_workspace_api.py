"""`/api/workspace/normalize`: the browser's only migration path.

localStorage hydration and 匯入 both post the project here instead of carrying a
JavaScript copy of the schema migration — two migrators is how the two prompt
composers drifted before the golden fixture."""

import pytest
from fastapi import HTTPException

from dodo_workshop.web import WorkspaceRequest, normalize_workspace_endpoint


def test_a_schema_one_project_comes_back_as_schema_two() -> None:
    result = normalize_workspace_endpoint(
        WorkspaceRequest(
            workspace={
                "schema_version": 1,
                "profile": {
                    "agent": {"name": "小暖", "max_output_tokens": 180},
                    "elder_profile": {"interests": ["老歌"]},
                    "proactive_policy": {"cooldown_minutes": 45, "priorities": {"news": 20}},
                },
            }
        )
    )["workspace"]

    assert result["schema_version"] == 2
    assert result["profile"]["agent"]["name"] == "小暖"
    assert "max_output_tokens" not in result["profile"]["agent"]
    assert result["profile"]["proactive_policy"] == {"interval_minutes": 45, "daily_limit": 4}
    assert [f["value"] for f in result["memory"]["facts"]] == ["老歌"]


def test_an_unknown_schema_is_a_400_not_a_500() -> None:
    with pytest.raises(HTTPException) as refused:
        normalize_workspace_endpoint(WorkspaceRequest(workspace={"schema_version": 9}))

    assert refused.value.status_code == 400
    assert "schema_version" in refused.value.detail


def test_normalizing_twice_is_the_identity() -> None:
    once = normalize_workspace_endpoint(WorkspaceRequest(workspace={"schema_version": 2}))["workspace"]
    twice = normalize_workspace_endpoint(WorkspaceRequest(workspace=once))["workspace"]

    assert twice == once
