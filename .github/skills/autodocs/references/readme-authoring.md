# README authoring

Read this before updating a repository's `README.md`. The README is the front
door: someone landing on the repository page must learn what the project is,
get it running, configure and use it, and see how it fits together, in one
scroll. It is shorter than the runbook and links to it for depth.

## Ownership: the managed block

autodocs owns only the text between these markers:

```markdown
<!-- autodocs:start -->
...
<!-- autodocs:end -->
```

- Never edit anything outside the markers. Badges, logos, contribution notes,
  licence text and anything else the owner wrote stay as they are.
- Write the block content to a temporary file and apply it with
  `autodocs readme apply`, which inserts the block after the title paragraph the
  first time and replaces only the block on later runs. Do not hand-edit the
  README file.
- If the existing README already covers a topic outside the block (for example
  its own install section), do not repeat it: keep the block's version brief and
  say "See *Installation* above", or leave that section out of the block and
  note it in your reply.
- The block starts at `##` level; the README's own `#` title stays outside.

## Content

Research exactly as for the runbook ([Runbook authoring → Research](runbook-authoring.md#research-before-writing)),
then write these `##` sections, in this order, using the project's real
commands, variables and paths:

| Section | Required | Content |
|---|---|---|
| `## Overview` | yes | Two to four sentences: what it does, for whom, and what it is not. Key capabilities as a short list. |
| `## Architecture` | yes | The architecture PNG as an image, a link to the interactive `.html`, then three to six bullets naming the main components and how a request or job flows through them. |
| `## Quick start` | yes | Prerequisites (runtime versions) and the shortest copy-pasteable path to a running instance. |
| `## Configuration` | yes | Table of variables or keys: name, required, default, purpose. |
| `## Usage` | yes | The main jobs with real commands or requests and their expected result. |
| `## Troubleshooting` | recommended | The three to five most likely problems: symptom → fix. |
| `## Documentation` | when a runbook exists | Link to `docs/autodocs/runbook.md` and the diagrams folder. |

Keep it scannable: short paragraphs, tables and code blocks. Citations
(`path/file.ext:line`) are optional in a README; use them sparingly where they
help a contributor find the code, and they are verified when present.

## Diagram image

GitHub cannot display the interactive diagram inline, so embed its PNG with a
path relative to the README:

```markdown
![Architecture](docs/autodocs/diagrams/architecture.png)

[Interactive diagram](docs/autodocs/diagrams/architecture.html) · [draw.io](docs/autodocs/diagrams/architecture.drawio)
```

Create the PNG with `autodocs png <diagram.html>` after the diagram passes
`finalize`.

## Apply and check

```bash
node <skill>/bin/autodocs.mjs readme apply README.md <block.md> --title "<Project>"
node <skill>/bin/autodocs.mjs readme check README.md --repo-root .
```

`readme check` verifies the block exists, its required sections, placeholders,
local links (including the PNG) and any citations. Fix every error. Delete the
temporary block file afterwards.
