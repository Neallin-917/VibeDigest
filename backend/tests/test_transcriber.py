import sys
import os
from unittest.mock import MagicMock

# Add backend to sys.path programmatically
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

# MOCK DEPENDENCIES BEFORE IMPORT (scoped and restored immediately after import)
_original_openai = sys.modules.get("openai")
_original_pydub = sys.modules.get("pydub")
sys.modules["openai"] = MagicMock()
sys.modules["pydub"] = MagicMock()

from services.formatting import (  # noqa: E402
    _merge_segments_into_sentences,
    _split_long_sentence_segments,
)
from utils.text_utils import (  # noqa: E402
    count_words_or_units,
    ends_with_sentence,
)

if _original_openai is not None:
    sys.modules["openai"] = _original_openai
else:
    sys.modules.pop("openai", None)

if _original_pydub is not None:
    sys.modules["pydub"] = _original_pydub
else:
    sys.modules.pop("pydub", None)

# Mock Segment class to avoid import issues or full object creation
class MockSegment:
    def __init__(self, start=0.0, end=0.0, text=""):
        self.start = start
        self.end = end
        self.text = text

class TestTranscriberLogic:
    def test_count_words_or_units(self):
        # English: counts words
        assert count_words_or_units("Hello world") == 2
        assert count_words_or_units("   spaced   out   ") == 2
        
        # CJK: counts chars (approx)
        assert count_words_or_units("你好世界") == 4
        
        # Mixed
        assert count_words_or_units("Hello 世界") == 2 

    def test_ends_with_sentence(self):
        assert ends_with_sentence("Hello.") is True
        assert ends_with_sentence("Hello!") is True
        assert ends_with_sentence("Hello?") is True
        assert ends_with_sentence("你好。") is True
        
        # Incomplete
        assert ends_with_sentence("Hello") is False
        assert ends_with_sentence("Mr.") is False  # Common abbrev from logic
        assert ends_with_sentence("google.com") is False # TLD logic
        
    def test_split_long_sentence_segments(self):
        # Create a long sequence of segments
        segments = [
            MockSegment(0.0, 1.0, "Word " * 10),
            MockSegment(1.0, 2.0, "Word " * 10),
            MockSegment(2.0, 3.0, "Word " * 10),
        ]
        # Just check it returns a list of chunks
        chunks = _split_long_sentence_segments(segments)
        assert isinstance(chunks, list)
        assert len(chunks) > 0
        
    def test_merge_segments_into_sentences_basic(self):
        segments = [
            MockSegment(0.0, 1.0, "Hello world."),
            MockSegment(1.0, 2.0, " This is a test."),
        ]
        sentences = _merge_segments_into_sentences(segments)
        assert len(sentences) == 2
        assert sentences[0]['text'] == "Hello world."
        assert sentences[1]['text'] == "This is a test."

    def test_merge_segments_across_split(self):
        # "Hello world" + "." split in segments check logic?
        # Actually logic handles: "Hello" + " world."
        segments = [
            MockSegment(0.0, 1.0, "Hello"),
            MockSegment(1.0, 2.0, " world."),
        ]
        sentences = _merge_segments_into_sentences(segments)
        assert len(sentences) == 1
        assert sentences[0]['text'] == "Hello world."
        assert sentences[0]['end'] == 2.0

        assert sentences[0]['end'] == 2.0
        
        # Verify text is preserved
        assert "Hello" in sentences[0]['text']
