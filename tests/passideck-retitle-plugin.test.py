#!/usr/bin/env python3
import importlib.util
import os
import sys
import threading
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

PLUGIN = Path(__file__).resolve().parents[1] / "plugins" / "passideck-retitle" / "__init__.py"


def load_plugin():
    spec = importlib.util.spec_from_file_location(f"passideck_retitle_test_{time.time_ns()}", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PassiDeckRetitlePluginTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "PASSIDECK_SESSION": "pane-1",
            "PASSIDECK_TITLE_GEN_LLM": "host_aux_title",
            "PASSIDECK_TITLE_ENDPOINT": "http://127.0.0.1:8791/internal/session-title",
            "HERMES_DELEGATED_CHILD_CONTEXT": "",
        }, clear=False)
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_first_prompt_posts_immediate_title_then_aux_refinement(self):
        plugin = load_plugin()
        posts = []
        refined = threading.Event()
        plugin._call_title_model = lambda context: "Dynamic session retitling"

        def post(pane_id, hermes_session_id, title, kind, revision):
            posts.append((pane_id, hermes_session_id, title, kind, revision))
            if kind == "model":
                refined.set()

        plugin._post_title = post
        plugin.on_pre_llm_call(
            session_id="hermes-1",
            user_message="Please build automatic dynamic session titles",
            conversation_history=[],
            is_first_turn=True,
        )

        self.assertEqual(posts[0], (
            "pane-1", "hermes-1", "Please build automatic dynamic session titles", "provisional", 1
        ), "the first title must be posted synchronously before the hook returns")
        self.assertTrue(refined.wait(2), "the host auxiliary title must refine in the background")
        self.assertEqual(posts[-1], (
            "pane-1", "hermes-1", "Dynamic session retitling", "model", 1
        ))

    def test_title_context_keeps_session_objective_and_recent_dialogue(self):
        plugin = load_plugin()
        history = [
            {"role": "user", "content": "Improve PassiDeck session retitling"},
            {"role": "assistant", "content": "The title lacks enough dialogue context."},
            *(
                {"role": "user" if number % 2 else "assistant", "content": f"Dialogue turn {number}"}
                for number in range(1, 9)
            ),
        ]

        context = plugin._build_title_context(
            "Yes, apply that improvement",
            history,
            "PassiDeck Session Retitling",
        )

        self.assertIn("Session objective (authoritative overall scope):\n- Improve PassiDeck session retitling", context)
        self.assertIn("Current title (continuity clue only): PassiDeck Session Retitling", context)
        self.assertIn("Recent conversation (supporting context):", context)
        self.assertIn("Assistant: Dialogue turn 2", context)
        self.assertIn("User: Yes, apply that improvement", context)
        self.assertNotIn("Dialogue turn 1", context)

    def test_title_context_recovers_goal_after_compaction(self):
        plugin = load_plugin()
        compaction = """[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted.
## Historical Task Snapshot
An async review finished without findings.

## Goal
Audit and simplify PassiDeck, then roll it out to the MiniPC and all backends.

## Constraints & Preferences
- Preserve active sessions.
"""
        history = [
            {"role": "user", "content": compaction},
            {"role": "assistant", "content": "The staged review completed without findings."},
            {"role": "user", "content": "Okay, now deploy the app and update all backends."},
        ]

        context = plugin._build_title_context(
            "Okay, now deploy the app and update all backends.",
            history,
            "Completed staged review",
        )

        self.assertIn(
            "Session objective (authoritative overall scope):\n- Audit and simplify PassiDeck, then roll it out to the MiniPC and all backends.",
            context,
        )
        self.assertNotIn("CONTEXT COMPACTION", context)
        self.assertNotIn("Historical Task Snapshot", context)
        self.assertNotIn("Completed staged review", context)
        self.assertNotIn("staged review completed", context)
        self.assertNotIn("Recent user request", context)
        self.assertNotIn("Okay, now deploy the app and update all backends.", context)

    def test_title_context_recovers_goal_from_assistant_compaction(self):
        plugin = load_plugin()
        compaction = """[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted.
## Goal
Keep the complete PassiDeck audit and rollout objective.

## Constraints
- Preserve context.
"""

        context = plugin._build_title_context(
            "Continue the rollout.",
            [{"role": "assistant", "content": compaction}],
            "Latest rollout phase",
        )

        self.assertIn(
            "Session objective (authoritative overall scope):\n- Keep the complete PassiDeck audit and rollout objective.",
            context,
        )
        self.assertNotIn("CONTEXT COMPACTION", context)
        self.assertNotIn("Latest rollout phase", context)

    def test_repeated_user_request_is_kept_as_latest_context(self):
        plugin = load_plugin()
        repeated = "Deploy PassiDeck to every backend."
        history = [
            {"role": "user", "content": repeated},
            {"role": "assistant", "content": "The first rollout completed."},
        ]

        context = plugin._build_title_context(repeated, history)

        self.assertEqual(context.splitlines()[-1], f"User: {repeated}")

    def test_synthetic_messages_do_not_retitle_the_pane(self):
        plugin = load_plugin()
        plugin._post_title = lambda *_args: self.fail("synthetic turns must not post titles")
        plugin._call_title_model = lambda _context: self.fail("synthetic turns must not call the title model")

        for message in (
            "[ASYNC DELEGATION BATCH COMPLETE — deleg_123]\nReview passed without findings.",
            "[System: Your previous response contained only internal reasoning and never produced a visible answer.",
        ):
            plugin.on_pre_llm_call(
                session_id="hermes-1",
                user_message=message,
                conversation_history=[],
                is_first_turn=False,
            )

        self.assertNotIn("pane-1", plugin._versions)

    def test_delegated_child_does_not_retitle_the_parent_pane(self):
        with patch.dict(os.environ, {"HERMES_DELEGATED_CHILD_CONTEXT": "1"}):
            plugin = load_plugin()
            plugin._post_title = lambda *_args: self.fail("delegated children must not post parent-pane titles")
            plugin._call_title_model = lambda _context: self.fail("delegated children must not call the title model")

            plugin.on_pre_llm_call(
                session_id="child-session",
                user_message="Review the staged diff and report findings.",
                conversation_history=[],
                is_first_turn=True,
            )
            plugin.on_session_reset(session_id="child-session-reset")

        self.assertNotIn("pane-1", plugin._versions)

    def test_same_process_delegation_context_is_detected(self):
        agent_module = types.ModuleType("agent")
        agent_module.__path__ = []
        delegation_module = types.ModuleType("agent.delegation_context")
        setattr(delegation_module, "is_delegated_child_process_context", lambda: True)

        with patch.dict(
            sys.modules,
            {"agent": agent_module, "agent.delegation_context": delegation_module},
        ):
            plugin = load_plugin()
            self.assertTrue(plugin._is_delegated_child())

    def test_latest_prompt_wins_without_parallel_model_calls(self):
        plugin = load_plugin()
        first_started = threading.Event()
        release_first = threading.Event()
        done = threading.Event()
        calls = []
        posts = []

        def model(context):
            calls.append(context)
            if len(calls) == 1:
                first_started.set()
                release_first.wait(2)
                return "Outdated title"
            return "Current topic title"

        def post(_pane_id, _session_id, title, kind, revision):
            posts.append((title, kind, revision))
            if kind == "model":
                done.set()

        plugin._call_title_model = model
        plugin._post_title = post
        plugin.on_pre_llm_call(session_id="hermes-1", user_message="Old topic", conversation_history=[], is_first_turn=False)
        self.assertTrue(first_started.wait(1))
        plugin.on_pre_llm_call(session_id="hermes-1", user_message="Completely new topic", conversation_history=[], is_first_turn=False)
        release_first.set()

        self.assertTrue(done.wait(2))
        self.assertEqual(len(calls), 2, "a busy pane must coalesce work to the latest pending prompt")
        self.assertEqual(posts, [("Current topic title", "model", 2)], "stale auxiliary results must never replace the latest title")

    def test_session_reset_clears_title_immediately(self):
        plugin = load_plugin()
        posts = []
        plugin._versions["pane-1"] = 4
        plugin._current_titles["pane-1"] = "Old session title"
        plugin._pending["pane-1"] = (4, "hermes-old", "old context")
        plugin._post_title = lambda *args: posts.append(args)

        plugin.on_session_reset(session_id="hermes-new")

        self.assertEqual(posts, [("pane-1", "hermes-new", "", "reset", 5)])
        self.assertNotIn("pane-1", plugin._current_titles)
        self.assertNotIn("pane-1", plugin._pending)

    def test_session_reset_discards_in_flight_old_title(self):
        plugin = load_plugin()
        model_started = threading.Event()
        release_model = threading.Event()
        posts = []

        def model(_context):
            model_started.set()
            release_model.wait(2)
            return "Old session title"

        plugin._call_title_model = model
        plugin._post_title = lambda *args: posts.append(args)
        plugin.on_pre_llm_call(
            session_id="hermes-old",
            user_message="Old topic",
            conversation_history=[],
            is_first_turn=False,
        )
        self.assertTrue(model_started.wait(1))

        plugin.on_session_reset(session_id="hermes-new")
        release_model.set()
        deadline = time.monotonic() + 2
        while "pane-1" in plugin._running and time.monotonic() < deadline:
            time.sleep(0.01)

        self.assertEqual(posts, [("pane-1", "hermes-new", "", "reset", 2)])
        self.assertNotIn("pane-1", plugin._running)

    def test_session_reset_does_not_wait_for_in_flight_title_post(self):
        plugin = load_plugin()
        model_post_started = threading.Event()
        release_model_post = threading.Event()
        reset_posted = threading.Event()
        posts = []

        plugin._call_title_model = lambda _context: "Old session title"

        def post(_pane_id, _session_id, _title, kind, _revision):
            if kind == "model":
                model_post_started.set()
                release_model_post.wait(2)
            posts.append(kind)
            if kind == "reset":
                reset_posted.set()
            return True

        plugin._post_title = post
        plugin.on_pre_llm_call(
            session_id="hermes-old",
            user_message="Old topic",
            conversation_history=[],
            is_first_turn=False,
        )
        self.assertTrue(model_post_started.wait(1))

        reset_thread = threading.Thread(
            target=plugin.on_session_reset,
            kwargs={"session_id": "hermes-new"},
        )
        reset_thread.start()
        cleared_without_waiting = reset_posted.wait(0.2)
        release_model_post.set()
        reset_thread.join(2)
        deadline = time.monotonic() + 2
        while "pane-1" in plugin._running and time.monotonic() < deadline:
            time.sleep(0.01)

        self.assertTrue(cleared_without_waiting, "reset must not wait for an old bridge request")
        self.assertEqual(posts, ["reset", "model"])
        self.assertNotIn("pane-1", plugin._current_titles)
        self.assertNotIn("pane-1", plugin._running)

    def test_image_prompt_uses_pixels_for_content_aware_title(self):
        plugin = load_plugin()
        recorded = {}
        posted = threading.Event()
        image_url = "data:image/png;base64,cGl4ZWxz"

        class Message:
            content = "PassiDeck Retitle Image Context"

        class Response:
            choices = [types.SimpleNamespace(message=Message())]

        def call_llm(**kwargs):
            recorded.update(kwargs)
            return Response()

        def post(_pane_id, _session_id, _title, kind, _revision):
            if kind == "model":
                posted.set()
            return True

        agent = types.ModuleType("agent")
        agent.__path__ = []
        auxiliary = types.ModuleType("agent.auxiliary_client")
        setattr(auxiliary, "call_llm", call_llm)
        config = types.ModuleType("hermes_cli.config")
        setattr(config, "load_config_readonly", lambda: {"auxiliary": {"title_generation": {"language": "English"}}})
        hermes_cli = types.ModuleType("hermes_cli")
        hermes_cli.__path__ = []
        runtime_helpers = types.ModuleType("agent.agent_runtime_helpers")
        setattr(runtime_helpers, "strip_think_blocks", lambda _agent, text: text)
        setattr(plugin, "_post_title", post)

        with patch.dict(sys.modules, {
            "agent": agent,
            "agent.auxiliary_client": auxiliary,
            "agent.agent_runtime_helpers": runtime_helpers,
            "hermes_cli": hermes_cli,
            "hermes_cli.config": config,
        }):
            plugin.on_pre_llm_call(
                session_id="hermes-image",
                user_message=[
                    {"type": "text", "text": "Please fix the failing media-path assertion"},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
                conversation_history=[],
                is_first_turn=True,
            )
            self.assertTrue(posted.wait(2), "the content-aware image title must complete")

        self.assertEqual(recorded["task"], "vision")
        self.assertIn("Never title the upload", recorded["messages"][0]["content"])
        title_request = recorded["messages"][1]["content"]
        self.assertIsInstance(title_request, list)
        self.assertIn("Please fix the failing media-path assertion", title_request[0]["text"])
        self.assertEqual(title_request[1], {"type": "image_url", "image_url": {"url": image_url}})

    def test_model_title_normalizes_passideck_brand(self):
        plugin = load_plugin()

        for title in (
            "Passideck Titelgenerierung prüfen",
            "Pasideck Titelgenerierung prüfen",
            "Passdeck Titelgenerierung prüfen",
        ):
            self.assertEqual(
                plugin._sanitize_model_title(title),
                "PassiDeck Titelgenerierung prüfen",
            )

    def test_model_title_removes_punctuation_after_length_limit(self):
        plugin = load_plugin()

        title = plugin._sanitize_model_title(
            "Linksgroupie/Celebforum-Scrape: Prüfen, Extrahieren, Validieren, Archivieren, Danach"
        )

        self.assertFalse(title.endswith(","), title)

    def test_model_call_uses_hermes_title_generation_aux_task(self):
        plugin = load_plugin()
        recorded = {}

        class Message:
            content = '<think>ignore</think>Title: "Portable PassiDeck Titles."'

        class Response:
            choices = [types.SimpleNamespace(message=Message())]

        def call_llm(**kwargs):
            recorded.update(kwargs)
            return Response()

        agent = types.ModuleType("agent")
        auxiliary = types.ModuleType("agent.auxiliary_client")
        auxiliary.call_llm = call_llm
        config = types.ModuleType("hermes_cli.config")
        config.load_config_readonly = lambda: {"auxiliary": {"title_generation": {"language": "English"}}}
        hermes_cli = types.ModuleType("hermes_cli")
        runtime_helpers = types.ModuleType("agent.agent_runtime_helpers")
        runtime_helpers.strip_think_blocks = lambda _agent, text: text.split("</think>", 1)[-1]

        with patch.dict(sys.modules, {
            "agent": agent,
            "agent.auxiliary_client": auxiliary,
            "agent.agent_runtime_helpers": runtime_helpers,
            "hermes_cli": hermes_cli,
            "hermes_cli.config": config,
        }):
            title = plugin._call_title_model("Recent user request")

        self.assertEqual(recorded["task"], "title_generation")
        self.assertIsNone(recorded.get("provider"), "the plugin must not bring or select its own provider")
        self.assertIsNone(recorded.get("model"), "Hermes must resolve the user's configured title auxiliary model")
        self.assertIn("Write the title in English", recorded["messages"][0]["content"])
        self.assertIn("COMPLETE authoritative Session objective", recorded["messages"][0]["content"])
        self.assertIn("brief follow-up", recorded["messages"][0]["content"])
        self.assertIn("multi-stage objective", recorded["messages"][0]["content"])
        self.assertIn("phase already named", recorded["messages"][0]["content"])
        self.assertIn("actual project name", recorded["messages"][0]["content"])
        self.assertIn("status or result", recorded["messages"][0]["content"])
        self.assertEqual(title, "Portable PassiDeck Titles")

    def test_non_passideck_and_off_sessions_are_inert(self):
        plugin = load_plugin()
        plugin._post_title = lambda *_args: self.fail("disabled plugin must not post")
        plugin._call_title_model = lambda _context: self.fail("disabled plugin must not call an LLM")
        with patch.dict(os.environ, {"PASSIDECK_SESSION": "", "PASSIDECK_TITLE_GEN_LLM": "host_aux_title"}):
            plugin.on_pre_llm_call(session_id="h", user_message="hello", conversation_history=[], is_first_turn=True)
        with patch.dict(os.environ, {"PASSIDECK_SESSION": "pane-1", "PASSIDECK_TITLE_GEN_LLM": "off"}):
            plugin.on_pre_llm_call(session_id="h", user_message="hello", conversation_history=[], is_first_turn=True)

    def test_registers_required_title_hooks(self):
        plugin = load_plugin()
        hooks = []
        ctx = types.SimpleNamespace(register_hook=lambda name, handler: hooks.append((name, handler)))
        plugin.register(ctx)
        self.assertEqual(hooks, [
            ("pre_llm_call", plugin.on_pre_llm_call),
            ("on_session_reset", plugin.on_session_reset),
        ])


if __name__ == "__main__":
    unittest.main()
