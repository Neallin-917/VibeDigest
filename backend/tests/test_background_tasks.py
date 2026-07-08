import pytest
from unittest.mock import MagicMock, AsyncMock, patch, ANY
import json
from services.background_tasks import run_pipeline, handle_retry_output
from dependencies import get_db_client, get_summarizer

@pytest.fixture
def mock_db_client():
    return MagicMock()

@pytest.fixture
def mock_summarizer():
    return AsyncMock()

@pytest.mark.asyncio
async def test_run_pipeline_success(mock_db_client):
    # Mock dependencies
    with (
        patch("services.background_tasks.get_db_client", return_value=mock_db_client),
        patch("services.background_tasks.workflow_app") as mock_workflow,
    ):

        mock_workflow.ainvoke = AsyncMock()

        await run_pipeline("task_1", "http://vid", "u1")

        mock_workflow.ainvoke.assert_called_once()
        # Verify initial state passed to ainvoke
        call_args = mock_workflow.ainvoke.call_args
        initial_state = call_args[0][0]
        assert initial_state["task_id"] == "task_1"
        assert initial_state["video_url"] == "http://vid"

@pytest.mark.asyncio
async def test_run_pipeline_failure(mock_db_client):
    with (
        patch("services.background_tasks.get_db_client", return_value=mock_db_client),
        patch("services.background_tasks.workflow_app") as mock_workflow
    ):
        
        mock_workflow.ainvoke = AsyncMock(side_effect=Exception("Pipeline Crash"))

        await run_pipeline("task_1", "http://vid", "u1")

        mock_db_client.update_task_status.assert_called_with("task_1", status="error", error="Pipeline Crash")

@pytest.mark.asyncio
async def test_handle_retry_output_script_success(mock_db_client, mock_summarizer):
    mock_db_client.get_output.return_value = {
        "id": "out_1", "task_id": "task_1", "user_id": "u1", "kind": "script"
    }
    
    raw_content = json.dumps({"segments": [{"text": "Hello", "start": 0, "end": 1}], "language": "en"})
    
    mock_db_client.get_task_outputs.return_value = [
        {"kind": "script_raw", "content": raw_content}
    ]
    
    mock_summarizer.optimize_transcript.return_value = "Optimized Text"

    with (
        patch("services.background_tasks.get_db_client", return_value=mock_db_client),
        patch("services.background_tasks.get_summarizer", return_value=mock_summarizer),
        patch("services.background_tasks.format_markdown_from_raw_segments", return_value="Markdown")
    ):
        
        await handle_retry_output("out_1", "u1")
        
        mock_summarizer.optimize_transcript.assert_called_with("Markdown")
        mock_db_client.update_output_status.assert_called_with(
            "out_1", status="completed", progress=100, content="Optimized Text", error=""
        )

@pytest.mark.asyncio
async def test_handle_retry_output_summary_success(mock_db_client, mock_summarizer):
    mock_db_client.get_output.return_value = {
        "id": "out_2", "task_id": "task_1", "user_id": "u1", "kind": "summary"
    }
    mock_db_client.get_task.return_value = {"video_title": "Video Title"}
    
    mock_db_client.get_task_outputs.return_value = [
        {"kind": "script", "content": "Transcript Content"},
        {"kind": "script_raw", "content": json.dumps({"language": "en"})}
    ]
    
    mock_summarizer.optimize_transcript.return_value = "Optimized Transcript"
    mock_summarizer.summarize_in_language_with_anchors.return_value = json.dumps({
        "version": 4,
        "language": "en",
        "tl_dr": "Short take.",
        "overview": "Detailed overview.",
        "keypoints": [
            {"title": "Point A", "detail": "Important detail.", "evidence": "Quoted support."}
        ],
    })

    with (
        patch("services.background_tasks.get_db_client", return_value=mock_db_client),
        patch("services.background_tasks.get_summarizer", return_value=mock_summarizer)
    ):
        
        await handle_retry_output("out_2", "u1")
        
        mock_summarizer.summarize_in_language_with_anchors.assert_called()
        mock_db_client.update_output_status.assert_any_call(
            "out_2", status="processing", progress=30, error=""
        )
        args, kwargs = mock_db_client.update_output_status.call_args
        assert args[0] == "out_2"
        assert kwargs["status"] == "completed"
        assert kwargs["progress"] == 100
        assert kwargs["error"] == ""
        stored_payload = json.loads(kwargs["content"])
        assert stored_payload["version"] == 4
        assert stored_payload["language"] == "en"
        assert stored_payload["overview"] == "Detailed overview."
        assert stored_payload["keypoints"][0]["evidence"] == "Quoted support."

@pytest.mark.asyncio
async def test_handle_retry_output_summary_rejects_invalid_payload(mock_db_client, mock_summarizer):
    mock_db_client.get_output.return_value = {
        "id": "out_2", "task_id": "task_1", "user_id": "u1", "kind": "summary"
    }
    mock_db_client.get_task.return_value = {"video_title": "Video Title"}
    mock_db_client.get_task_outputs.return_value = [
        {"kind": "script", "content": "Transcript Content"},
        {"kind": "script_raw", "content": json.dumps({"language": "en"})}
    ]

    mock_summarizer.optimize_transcript.return_value = "Optimized Transcript"
    mock_summarizer.summarize_in_language_with_anchors.return_value = json.dumps({
        "version": 3,
        "language": "en",
        "overview": "Legacy overview.",
        "keypoints": [{"title": "Point A", "detail": "Important detail.", "evidence": "Quoted support."}],
    })

    with (
        patch("services.background_tasks.get_db_client", return_value=mock_db_client),
        patch("services.background_tasks.get_summarizer", return_value=mock_summarizer)
    ):
        await handle_retry_output("out_2", "u1")

        args, kwargs = mock_db_client.update_output_status.call_args
        assert args[0] == "out_2"
        assert kwargs["status"] == "error"
        assert "V4" in kwargs["error"]

@pytest.mark.asyncio
async def test_handle_retry_output_unauthorized(mock_db_client):
    mock_db_client.get_output.return_value = {
        "id": "out_1", "user_id": "other_user"
    }
    with patch("services.background_tasks.get_db_client", return_value=mock_db_client):
        await handle_retry_output("out_1", "u1")
        mock_db_client.update_output_status.assert_called_with("out_1", status="error", error="Not authorized")

@pytest.mark.asyncio
async def test_handle_retry_output_missing_raw(mock_db_client):
    mock_db_client.get_output.return_value = {
        "id": "out_1", "task_id": "task_1", "user_id": "u1", "kind": "script"
    }
    mock_db_client.get_task_outputs.return_value = [] # No raw output

    with patch("services.background_tasks.get_db_client", return_value=mock_db_client):
        await handle_retry_output("out_1", "u1")
        args, kwargs = mock_db_client.update_output_status.call_args
        assert kwargs["status"] == "error"
        assert "No raw transcript segments" in kwargs["error"]
