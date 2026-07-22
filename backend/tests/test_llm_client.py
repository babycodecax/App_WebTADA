import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_llm_client_imports() -> None:
    """Verify llm_client module can be imported without errors."""
    from llm_client import stream_answer, _build_messages, _sanitize_heading

    assert callable(stream_answer)
    assert callable(_build_messages)
    assert callable(_sanitize_heading)
