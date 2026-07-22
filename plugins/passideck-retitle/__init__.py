"""PassiDeck-owned dynamic session titles for Hermes panes.

The plugin is inert outside a PassiDeck-launched process. It clears the pane
title on a Hermes session reset, observes the supported pre_llm_call hook,
publishes an immediate first-prompt title to the local PassiDeck bridge, then
refines titles asynchronously with Hermes' configured auxiliary.title_generation route.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

_MODE = "host_aux_title"
_DEFAULT_ENDPOINT = "http://127.0.0.1:8791/internal/session-title"
_TITLE_LIMIT = 80
_CONTEXT_LIMIT = 3000
_INSTANCE_EPOCH = time.time_ns()

_lock = threading.Lock()
_versions: dict[str, int] = {}
_pending: dict[str, tuple[int, str, str]] = {}
_running: set[str] = set()
_current_titles: dict[str, str] = {}


def _clean_text(value: Any) -> str:
    text = str(value or "").replace("\x00", " ")
    text = re.sub(r"[\x01-\x1f\x7f]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _provisional_title(user_message: str) -> str:
    text = _clean_text(user_message).lstrip("#>*_- `")
    words = text.split()[:7]
    title = " ".join(words).strip(" \t\r\n\"'`.,:;!?-")
    return title[:_TITLE_LIMIT].rstrip() if title else ""


def _message_text(message: Any) -> str:
    if not isinstance(message, dict):
        return ""
    content = message.get("content", "")
    if isinstance(content, str):
        return _clean_text(content)
    if isinstance(content, list):
        return _clean_text(" ".join(
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict) and part.get("type") in {"text", "input_text"}
        ))
    return ""


def _build_title_context(user_message: str, conversation_history: Any, current_title: str = "") -> str:
    messages = []
    for message in conversation_history if isinstance(conversation_history, list) else []:
        if isinstance(message, dict) and message.get("role") == "user":
            text = _message_text(message)
            if text:
                messages.append(text)
    latest = _clean_text(user_message)
    if latest and (not messages or messages[-1] != latest):
        messages.append(latest)
    original_goal = messages[0] if messages else latest
    recent = messages[-4:]

    lines = ["Original session goal:", f"- {original_goal[:900]}"]
    if current_title:
        lines.append(f"Current title: {_clean_text(current_title)[:_TITLE_LIMIT]}")
    lines.append("Recent user requests:")
    lines.extend(f"- {message[:450]}" for message in recent)
    context = "\n".join(lines)
    return context[:_CONTEXT_LIMIT]


def _configured_title_language() -> str:
    try:
        from hermes_cli.config import load_config_readonly  # type: ignore[import-not-found]

        config = load_config_readonly() or {}
        return _clean_text(
            ((config.get("auxiliary") or {}).get("title_generation") or {}).get("language", "")
        )
    except Exception:
        return ""


def _sanitize_model_title(content: str) -> str:
    try:
        from agent.agent_runtime_helpers import strip_think_blocks  # type: ignore[import-not-found]

        content = strip_think_blocks(None, content)
    except Exception:
        content = re.sub(r"<think\b[^>]*>.*?</think\s*>", "", content or "", flags=re.I | re.S)
    title = _clean_text(content).splitlines()[0].strip() if content else ""
    title = re.sub(r"^title\s*:\s*", "", title, flags=re.I).strip()
    title = title.strip("\"'`")
    title = title.rstrip(".,:;!?").strip()
    if len(title) > _TITLE_LIMIT:
        title = title[:_TITLE_LIMIT].rsplit(" ", 1)[0] or title[:_TITLE_LIMIT]
    return title


def _call_title_model(context: str) -> str:
    # The task name is the contract: Hermes resolves the user's existing
    # auxiliary.title_generation provider/model/auth/fallback configuration.
    from agent.auxiliary_client import call_llm  # type: ignore[import-not-found]

    language = _configured_title_language()
    language_rule = f"Write the title in {language}. " if language else "Use the language of the latest user request. "
    response = call_llm(
        task="title_generation",
        provider=None,
        model=None,
        messages=[
            {
                "role": "system",
                "content": (
                    "Generate a stable title for this conversation's main objective in 3-7 words. "
                    "Treat the Original session goal and Current title as anchors. "
                    "Do not replace the main topic with a temporary subtask, implementation detail, "
                    "status check, or tangent. Keep the current title when the main objective has not "
                    "materially changed; update it only when the user clearly changes that objective. "
                    f"{language_rule}Return only the title, without quotes, prefix, or trailing punctuation."
                ),
            },
            {"role": "user", "content": context},
        ],
        temperature=0.2,
        max_tokens=80,
    )
    content = getattr(getattr(response.choices[0], "message", None), "content", "") or ""
    return _sanitize_model_title(content)


def _post_title(pane_id: str, hermes_session_id: str, title: str, kind: str, revision: int) -> bool:
    endpoint = os.environ.get("PASSIDECK_TITLE_ENDPOINT", _DEFAULT_ENDPOINT).strip() or _DEFAULT_ENDPOINT
    phase = 0 if kind in ("provisional", "reset") else 1
    body = json.dumps({
        "sessionId": pane_id,
        "hermesSessionId": hermes_session_id,
        "title": title,
        "kind": kind,
        "generation": f"{_INSTANCE_EPOCH}:{revision}:{phase}",
    }).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "passideck-retitle/1"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=0.35) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
            return 200 <= int(response.status) < 300 and not payload.get("stale")
    except Exception as exc:
        logger.debug("PassiDeck title bridge unavailable: %s", exc)
        return False


def _worker(pane_id: str) -> None:
    while True:
        with _lock:
            job = _pending.pop(pane_id, None)
            if job is None:
                _running.discard(pane_id)
                return
        version, hermes_session_id, context = job
        try:
            title = _call_title_model(context)
        except Exception as exc:
            logger.warning("PassiDeck title generation failed: %s", exc)
            title = ""

        if not title:
            continue
        with _lock:
            if _versions.get(pane_id) != version:
                continue
        posted = _post_title(pane_id, hermes_session_id, title, "model", version)
        if posted is not False:
            with _lock:
                if _versions.get(pane_id) == version:
                    _current_titles[pane_id] = title


def on_pre_llm_call(**kwargs: Any) -> None:
    pane_id = os.environ.get("PASSIDECK_SESSION", "").strip()
    mode = os.environ.get("PASSIDECK_TITLE_GEN_LLM", _MODE).strip().lower()
    user_message = _clean_text(kwargs.get("user_message", ""))
    if not pane_id or mode != _MODE or not user_message:
        return None

    hermes_session_id = _clean_text(kwargs.get("session_id", ""))[:160]
    provisional = _provisional_title(user_message) if kwargs.get("is_first_turn") else ""

    with _lock:
        version = _versions.get(pane_id, 0) + 1
        _versions[pane_id] = version
        previous_title = _current_titles.get(pane_id, "")
        context = _build_title_context(
            user_message,
            kwargs.get("conversation_history", []),
            previous_title,
        )
        if provisional:
            _current_titles[pane_id] = provisional
        _pending[pane_id] = (version, hermes_session_id, context)
        start_worker = pane_id not in _running
        if start_worker:
            _running.add(pane_id)

    if provisional:
        _post_title(pane_id, hermes_session_id, provisional, "provisional", version)
    if start_worker:
        threading.Thread(target=_worker, args=(pane_id,), daemon=True, name=f"passideck-title-{pane_id[:16]}").start()
    return None


def on_session_reset(**kwargs: Any) -> None:
    pane_id = os.environ.get("PASSIDECK_SESSION", "").strip()
    mode = os.environ.get("PASSIDECK_TITLE_GEN_LLM", _MODE).strip().lower()
    hermes_session_id = _clean_text(kwargs.get("session_id", ""))[:160]
    if not pane_id or mode != _MODE or not hermes_session_id:
        return None

    with _lock:
        version = _versions.get(pane_id, 0) + 1
        _versions[pane_id] = version
        _pending.pop(pane_id, None)
        _current_titles.pop(pane_id, None)

    _post_title(pane_id, hermes_session_id, "", "reset", version)
    return None


def register(ctx: Any) -> None:
    ctx.register_hook("pre_llm_call", on_pre_llm_call)
    ctx.register_hook("on_session_reset", on_session_reset)
