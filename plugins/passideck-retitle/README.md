# PassiDeck Hermes title integration

This integration is shipped, installed, and enabled automatically by PassiDeck.
Its Hermes hook is inert outside terminals launched by PassiDeck; users do not
install or manage a separate title plugin.

For normal `hermes` CLI panes it mirrors Hermes' real turn lifecycle through
the local PassiDeck bridge, so the pane header shows the same working spinner
as `hermes --tui`. TUI panes keep their native Hermes event publisher and are
not double-published by this hook.

Retitle is session-bound. Hermes `/new` and `/reset` clear the pane title
immediately and latch the current PassiDeck setting for the new Hermes session.
A first-turn provisional title is reserved in Hermes' canonical `state.db`
without an LLM call, then refined through Hermes' existing
`auxiliary.title_generation` task. The same final title is mirrored into
PassiDeck, so the pane, picker, and Hermes session search use one title.

The plugin does not contain provider credentials, does not select its own model,
and does not modify Hermes core. It uses Hermes' public `SessionDB` title API.

The PassiDeck Settings panel controls the feature and persists this equivalent
configuration (`~/.passideck/config.yaml`):

```yaml
titleGenLlm: host_aux_title # dynamic titles on; use off to disable
```

The setting applies to the next Hermes session, including `/new` and `/reset`
inside the same PassiDeck pane. The current session keeps its existing mode.
