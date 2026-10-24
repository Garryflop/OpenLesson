"""AI Assistant client: OpenAI-compatible API (OpenAI / local LLM), structured answers, fallbacks."""

import json

import httpx

from app.config import settings
from app.services import ai


def _mock_client(monkeypatch, handler):
    real = httpx.Client
    monkeypatch.setattr(ai.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_local_llm_falls_back_to_json_mode(monkeypatch):
    formats = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        formats.append(body["response_format"]["type"])
        assert request.url.path.endswith("/chat/completions") and body["model"] == "qwen2.5:7b"
        if body["response_format"]["type"] == "json_schema":  # an older local server without structured outputs
            return httpx.Response(400, json={"error": "response_format json_schema is not supported"})
        content = json.dumps({"invitation_text": "Welcome to the open lesson!", "short_description": "Demo"})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": "stop"}]})

    _mock_client(monkeypatch, handler)
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "ai_provider", "local")
    assert ai.provider() == "local_llm" and ai.model_name() == "qwen2.5:7b"
    out = ai._ask_llm("Write an invitation", ai.Invitation)
    assert out.invitation_text == "Welcome to the open lesson!"
    assert formats == ["json_schema", "json_object"]


def test_openai_needs_a_key_and_rejects_bad_answers(monkeypatch):
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "ai_provider", "openai")
    monkeypatch.setattr(settings, "ai_api_key", "")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert ai.provider() == "local"  # no key → rule-based analyser

    monkeypatch.setattr(settings, "ai_api_key", "sk-test")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer sk-test"
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"unexpected": true}'}, "finish_reason": "stop"}]})

    _mock_client(monkeypatch, handler)
    assert ai.provider() == "openai" and ai.model_name() == "gpt-4o-mini"
    try:
        ai._ask_llm("Write an invitation", ai.Invitation)
    except ai.LLMError:
        pass
    else:
        raise AssertionError("an answer that does not match the schema must be rejected")
