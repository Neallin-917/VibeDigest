import pytest
import asyncio
import json
from services.comprehension import ComprehensionAgent
from unittest.mock import MagicMock, AsyncMock, patch

@pytest.mark.asyncio
async def test_generate_comprehension_brief():
    agent = ComprehensionAgent()
    agent.use_response_format_json = False
    transcript = """
    In this video, we are going to talk about the future of AI. 
    AI is moving from narrow tasks to general reasoning. 
    The core problem is that current models are still "stochastic parrots" without true understanding. 
    The speaker's position is that we need a new architecture, perhaps neuro-symbolic, to reach AGI.
    Key insights: 
    1. Scaling laws are hitting diminishing returns. 
    2. Data quality is more important than quantity now.
    3. Reasoning requires a world model, not just text prediction.
    Ignore the 5-minute sponsor segment about NordVPN at the beginning.
    This is for AI researchers and engineers. Not for casual tech fans.
    Takeaway: Always ask if your model has a world model or just a grammar model.
    """
    
    
    # Mock response data that satisfies all assertions
    mock_data = {
        "core_intent": "Test intent",
        "core_position": "Test position",
        "key_insights": [
            {"title": "Constraint 1", "new_perspective": "Perspective 1", "why_it_matters": "Reason 1"},
            {"title": "Constraint 2", "new_perspective": "Perspective 2", "why_it_matters": "Reason 2"},
            {"title": "Constraint 3", "new_perspective": "Perspective 3", "why_it_matters": "Reason 3"}
        ],
        "what_to_ignore": ["Sponsors"],
        "target_audience": {
            "who_benefits": ["Researchers"],
            "who_wont": ["Casual fans"]
        },
        "reusable_takeaway": "Test takeaway"
    }

    # Create a mock for the structured LLM result
    # The ainvoke method needs to return an object that has a model_dump method
    # or be the Pydantic model itself.
    
    mock_brief_obj = MagicMock()
    mock_brief_obj.model_dump.return_value = mock_data
    
    # Mock the LLM chain
    mock_structured_llm = MagicMock()
    mock_structured_llm.ainvoke = AsyncMock(return_value=mock_brief_obj)

    mock_message = MagicMock()
    mock_message.content = json.dumps(mock_data)
    
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_structured_llm
    mock_llm.ainvoke = AsyncMock(return_value=mock_message)

    # Patch _get_llm to return our mock_llm
    with patch.object(agent, '_get_llm', return_value=mock_llm):
        # Test zh
        brief_zh = await agent.generate_comprehension_brief(transcript, target_language="zh")
        assert brief_zh is not None
        data_zh = json.loads(brief_zh)
        assert "core_intent" in data_zh
        assert "core_position" in data_zh
        assert "key_insights" in data_zh
        assert len(data_zh["key_insights"]) >= 3
        assert "title" in data_zh["key_insights"][0]
        assert "new_perspective" in data_zh["key_insights"][0]

        # Test en
        brief_en = await agent.generate_comprehension_brief(transcript, target_language="en")
        assert brief_en is not None
        data_en = json.loads(brief_en)
        assert "core_intent" in data_en
        assert "reusable_takeaway" in data_en
        assert isinstance(data_en["what_to_ignore"], list)

@pytest.mark.asyncio
async def test_generate_comprehension_brief_retries_after_empty_json():
    agent = ComprehensionAgent()
    transcript = "This transcript is long enough to avoid skip logic. " * 5

    valid_payload = {
        "core_intent": "intent",
        "core_position": "position",
        "key_insights": [
            {"title": "a", "new_perspective": "b", "why_it_matters": "c"},
            {"title": "d", "new_perspective": "e", "why_it_matters": "f"},
            {"title": "g", "new_perspective": "h", "why_it_matters": "i"}
        ],
        "what_to_ignore": ["sponsor"],
        "target_audience": {"who_benefits": ["builders"], "who_wont": ["tourists"]},
        "reusable_takeaway": "takeaway"
    }

    first = MagicMock(); first.content = "{}"
    second = MagicMock(); second.content = json.dumps(valid_payload)

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=[first, second])

    with patch.object(agent, '_get_llm', return_value=mock_llm), \
         patch.object(agent, 'comprehension_models', ['model-a']):
        result = await agent.generate_comprehension_brief(transcript, target_language="en")

    data = json.loads(result)
    assert data["core_intent"] == "intent"
    assert mock_llm.ainvoke.await_count == 2

@pytest.mark.asyncio
async def test_generate_comprehension_brief_repairs_after_invalid_retry():
    agent = ComprehensionAgent()
    transcript = "This transcript is long enough to avoid skip logic. " * 5

    first = MagicMock(); first.content = "{}"
    second = MagicMock(); second.content = "not-json"
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=[first, second])

    repaired_payload = {
        "core_intent": "intent",
        "core_position": "position",
        "key_insights": [
            {"title": "a", "new_perspective": "b", "why_it_matters": "c"},
            {"title": "d", "new_perspective": "e", "why_it_matters": "f"},
            {"title": "g", "new_perspective": "h", "why_it_matters": "i"}
        ],
        "what_to_ignore": ["sponsor"],
        "target_audience": {"who_benefits": ["builders"], "who_wont": ["tourists"]},
        "reusable_takeaway": "takeaway"
    }

    with patch.object(agent, '_get_llm', return_value=mock_llm), \
         patch.object(agent, 'comprehension_models', ['model-a']), \
         patch.object(agent, '_repair_json_to_schema', new=AsyncMock(return_value=json.dumps(repaired_payload))) as mock_repair:
        result = await agent.generate_comprehension_brief(transcript, target_language="en")

    data = json.loads(result)
    assert data["core_position"] == "position"
    mock_repair.assert_awaited_once()

@pytest.mark.asyncio
async def test_generate_comprehension_brief_raises_after_all_models_fail():
    agent = ComprehensionAgent()
    transcript = "This transcript is long enough to avoid skip logic. " * 5

    mock_message = MagicMock()
    mock_message.content = "{}"

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=mock_message)

    with patch.object(agent, '_get_llm', return_value=mock_llm), \
         patch.object(agent, 'comprehension_models', ['model-a']):
        with pytest.raises(Exception, match="validation errors|empty JSON object|All models failed"):
            await agent.generate_comprehension_brief(transcript, target_language="en")

if __name__ == "__main__":
    asyncio.run(test_generate_comprehension_brief())
