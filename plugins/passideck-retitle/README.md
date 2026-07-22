# PassiDeck Hermes title integration

This integration is installed and enabled automatically by PassiDeck's
installer. Its Hermes hook is inert outside terminals launched by PassiDeck.
Hermes `/new` and `/reset` clear the pane title immediately. On the first user
prompt it publishes an immediate provisional pane title before the agent
answers. It then refines the title in the background while preserving the
session's original goal across later subtasks.

The model call uses Hermes' existing `auxiliary.title_generation` task. The
plugin does not contain provider credentials, does not select its own model,
and does not modify Hermes core or Hermes' session database. No separate user
installation step is required.

PassiDeck configuration (`~/.passideck/config.yaml`):

```yaml
titleGenLlm: host_aux_title # default; use off to disable
```
