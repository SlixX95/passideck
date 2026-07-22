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

    def test_title_context_keeps_original_goal_when_recent_requests_move_on(self):
        plugin = load_plugin()
        history = [
            {"role": "user", "content": "Improve PassiDeck session retitling"},
            *(
                {"role": "user", "content": f"Implementation detail {number}"}
                for number in range(1, 8)
            ),
        ]

        context = plugin._build_title_context(
            "Run the final tests",
            history,
            "PassiDeck Session Retitling",
        )

        self.assertIn("Original session goal:\n- Improve PassiDeck session retitling", context)
        self.assertIn("Current title: PassiDeck Session Retitling", context)
        self.assertIn("- Run the final tests", context)
        self.assertNotIn("Implementation detail 1", context)

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
        self.assertIn("Original session goal", recorded["messages"][0]["content"])
        self.assertIn("temporary subtask", recorded["messages"][0]["content"])
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
