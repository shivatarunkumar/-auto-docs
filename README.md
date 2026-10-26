# autodocs

Type `/autodocs` in GitHub Copilot or Claude Code and get a documentation set
for your codebase that is ready for Confluence:

- **Architecture and flow diagrams** as interactive HTML (focus, path tracing,
  PNG/SVG export) *and* as editable **draw.io** (`.drawio`) files you can import
  into Confluence.
- **A runbook** that covers what the project is for, how to install,
  configure, use, deploy and troubleshoot it, and how it works. The
  implementation walkthrough cites the source (`path/file.ext:line`), and every
  citation is checked against the repository.
- **A Confluence bundle**: the runbook in Confluence storage format and
  Markdown, the diagrams as attachments, and step-by-step import instructions.

## Example

[`examples/orders-service/`](examples/orders-service/) is a small orders API
with its generated docs in
[`docs/autodocs/`](examples/orders-service/docs/autodocs/):

| File | What it is |
|---|---|
| `runbook.md` | Runbook with 43 checked source citations |
| `diagrams/architecture.html` / `.drawio` | Runtime architecture |
| `diagrams/order-payment-flow.html` / `.drawio` | Order and payment sequence |
| `confluence/` | `page.xhtml`, `page.md`, `attachments/`, `IMPORT.md` |

## Requirements

- Node.js 18 or newer.
- A Chromium-based browser (Chrome, Edge or Chromium). The diagram engine uses
  it to check each rendered diagram.
- To show draw.io diagrams inside Confluence pages, your site needs the
  *draw.io Diagrams for Confluence* app.

Check your setup with `node skills/autodocs/bin/autodocs.mjs doctor`.

## Install

Clone once:

```bash
git clone https://github.com/shivatarunkumar/-auto-docs.git autodocs
cd autodocs
```

### GitHub Copilot (VS Code)

```bash
node install.mjs --agent copilot                     # for you: ~/.copilot/skills/autodocs
node install.mjs --agent copilot --project ~/my-app  # for a repo: ~/my-app/.github/skills/autodocs
```

Commit the project install (`.github/skills/autodocs`) to share it with your
team. In Copilot Chat, switch to **Agent** mode and type `/autodocs`. If the
command doesn't appear, enable agent skills in VS Code settings
(`chat.useAgentSkills`) and reload the window.

### Claude Code

Install it as a plugin:

```text
/plugin marketplace add shivatarunkumar/-auto-docs
/plugin install autodocs@autodocs
```

Or copy the skill: `node install.mjs --agent claude` (or `--project <repo>`
for `.claude/skills/`). Then run `/autodocs`. Plugin skills can also be called
by their full name, `/autodocs:autodocs`.

To update, `git pull` and re-run the installer with `--force`. To remove,
re-run it with `--uninstall`.

## Use

Run these from the root of the repository you want to document:

```text
/autodocs                                  full set: architecture, flows, runbook, Confluence bundle
/autodocs architecture                     only the architecture diagram (+ .drawio)
/autodocs flows the checkout and refund flows
/autodocs runbook for on-call engineers
/autodocs services/billing write docs to docs/billing
```

Output goes to `docs/autodocs/` unless you name another folder:

```text
docs/autodocs/
  runbook.md
  diagrams/<name>.json | .html | .drawio
  confluence/page.xhtml  page.md  attachments/  IMPORT.md
```

Re-running `/autodocs` updates the same folder for the current commit.

## Publishing to Confluence

Follow `docs/autodocs/confluence/IMPORT.md`. In short:

1. Create the page from `page.xhtml` (storage format, via the REST API or a
   source-editor app), or paste `page.md` with *Insert → Markup → Markdown*.
2. Upload everything in `attachments/` to the page.
3. Each blue "Diagram" panel names a `.drawio` file. Replace it using
   *Insert → draw.io Diagram → Import* and choose that file. The diagram stays
   editable in Confluence.

## CLI

The agent runs these for you. They also work by hand:

```bash
A=skills/autodocs/bin/autodocs.mjs
node $A finalize architecture docs/autodocs/diagrams/architecture.json docs/autodocs/diagrams/architecture.html --repo-root . --quality showcase --json
node $A drawio docs/autodocs/diagrams/architecture.html          # → architecture.drawio
node $A runbook check docs/autodocs/runbook.md --repo-root .     # contract + citation check
node $A confluence docs/autodocs/runbook.md                      # → runbook.confluence.xhtml
node $A bundle docs/autodocs --repo-root .                       # all of the above + confluence/
node $A help-engine                                              # diagram engine commands
```

## Repository layout

| Path | Purpose |
|---|---|
| `skills/autodocs/SKILL.md` | The `/autodocs` skill: workflow the agent follows |
| `skills/autodocs/references/runbook-authoring.md` | Runbook sections, research method, citation rules |
| `skills/autodocs/bin/autodocs.mjs` | CLI: `drawio`, `runbook check`, `confluence`, `bundle`, plus the engine |
| `skills/autodocs/drawio/` | Rendered diagram → draw.io converter |
| `skills/autodocs/docs/` | Runbook checker and Markdown → Confluence converter |
| `skills/autodocs/renderers/`, `schemas/`, `bin/engine.mjs` | Diagram engine: rendering and validation |
| `.claude-plugin/` | Claude Code plugin and marketplace manifests |
| `install.mjs` | Installer for GitHub Copilot and Claude Code |
| `tests/` | `npm test` |

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
