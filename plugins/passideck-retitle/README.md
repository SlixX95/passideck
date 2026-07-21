# PassiDeck Retitle Hermes Plugin

This companion plugin is shipped by PassiDeck and is inert outside terminals
launched by PassiDeck. Hermes `/new` and `/reset` clear the pane title
immediately. On the first user prompt it publishes an immediate provisional
pane title before the agent answers. It then refines the title in the background
on every user turn.

The model call uses Hermes' existing `auxiliary.title_generation` task. The
plugin does not contain provider credentials, does not select its own model,
and does not modify Hermes core or Hermes' session database.

Install from the PassiDeck repository:

```bash
hermes plugins install SlixX95/passideck-dev/plugins/passideck-retitle --enable
```

PassiDeck configuration (`~/.passideck/config.yaml`):

```yaml
titleGenLlm: host_aux_title # default; use off to disable
```
