# autodocs

Documentation for your codebase, generated from the code, in GitHub Copilot or
Claude Code. Pick the command for what you need:

| Command | You get |
|---|---|
| `/autodocs` | Everything below: architecture and flow diagrams, runbook, Confluence package |
| `/autodocs-runbook` | `runbook.md` with the architecture diagram (`text-only` for no diagram) |
| `/autodocs-confluence` | A Confluence package: `page.html` to copy-paste, draw.io and PNG diagrams, `IMPORT.md` |
| `/autodocs-confluence-upload` | Publishes straight to Confluence Cloud: a new or existing page, diagrams as images, `.drawio` files attached |
| `/autodocs-readme` | Your `README.md` updated with overview, architecture image, quick start, configuration and usage |

What the outputs contain:

- **Diagrams** as interactive HTML (focus, path tracing, PNG/SVG export),
  editable **draw.io** (`.drawio`) files for Confluence, and **PNG** images for
  READMEs.
- **A runbook** covering what the project is for, how to install, configure,
  use, deploy and troubleshoot it, and how it works. The implementation
  walkthrough cites the source (`path/file.ext:line`), and every citation is
  checked against the repository.
- **A Confluence package** you can import without any API: a page to
  copy-paste, the diagrams as attachments, and step-by-step instructions.
- **A README block** between `<!-- autodocs:start -->` and
  `<!-- autodocs:end -->`. Everything else in your README stays exactly as you
  wrote it; re-running replaces only that block.

## Example

[`examples/orders-service/`](examples/orders-service/) is a small orders API
documented by autodocs: see its [README](examples/orders-service/README.md) and
[`docs/autodocs/`](examples/orders-service/docs/autodocs/):

| File | What it is |
|---|---|
| `runbook.md` | Runbook with 43 checked source citations |
| `diagrams/architecture.*` | Runtime architecture: `.json` source, `.html`, `.drawio`, `.png` |
| `diagrams/order-payment-flow.*` | Order and payment sequence |
| `confluence/` | `page.html`, `page.md`, `page.xhtml`, `attachments/`, `IMPORT.md` |

## Requirements

- Node.js 18 or newer.
- A Chromium-based browser (Chrome, Edge or Chromium). It checks each rendered
  diagram and exports the PNG images.
- To show draw.io diagrams inside Confluence pages, your site needs the
  *draw.io Diagrams for Confluence* app (otherwise use the PNGs).

Check your setup with `node skills/autodocs/bin/autodocs.mjs doctor`.

## Install

### Claude Code

```bash
claude plugin marketplace add shivatarunkumar/-auto-docs
claude plugin install autodocs@autodocs
```

(Inside the Claude Code terminal you can use `/plugin marketplace add …` and
`/plugin install …` instead.) Restart Claude Code, then run any of the four
commands. Plugin skills can also be called by their full name, for example
`/autodocs:autodocs-readme`.

Update later with:

```bash
claude plugin marketplace update autodocs
claude plugin update autodocs@autodocs
```

To install without the plugin system, clone this repo and run
`node autodocs/install.mjs --agent claude`, which copies the skills into
`~/.claude/skills/`.

### GitHub Copilot in VS Code

1. Clone this repo and run the installer from the folder that contains the
   clone. Choose one of the two install commands:

   ```bash
   git clone https://github.com/shivatarunkumar/-auto-docs.git autodocs

   # Just for you, in every project (~/.copilot/skills/):
   node autodocs/install.mjs --agent copilot

   # Or for one repo, shared with your team (<repo>/.github/skills/):
   node autodocs/install.mjs --agent copilot --project ~/my-app
   ```

   For a repo install, commit the new `.github/skills/autodocs*` folders so
   your teammates get the commands too.

2. Reload VS Code: open the Command Palette and run *Developer: Reload Window*.

3. Open your project, open Copilot Chat in **Agent** mode, type `/` and pick a
   command, for example `/autodocs-readme`. Allow the agent to run terminal
   commands when it asks; it needs them to generate and check the docs.

**To update:** run `git pull` in the clone, then re-run the same install command
with `--force`. **To remove:** re-run it with `--uninstall`.

The installer always copies all five skills, because the other four use the
engine in `autodocs`. Keep the folder names as they are: VS Code doesn't load a
skill whose folder name differs from its `name`.

If the commands don't appear, check that `~/.copilot/skills/autodocs/SKILL.md`
exists (or `.github/skills/autodocs/SKILL.md` for a repo install), then type
`/skills` in the chat to see what Copilot has loaded.

**Alternative, as a VS Code agent plugin:** make sure the `chat.plugins.enabled`
setting is on, run *Chat: Install Plugin from Source* from the Command Palette,
and enter `https://github.com/shivatarunkumar/-auto-docs`. Plugin commands may be
prefixed, for example `/autodocs:autodocs-readme`.

### GitHub Copilot CLI

```bash
copilot plugin install shivatarunkumar/-auto-docs   # install
copilot plugin update autodocs                      # update
copilot plugin uninstall autodocs                   # remove
```

## Use

Run commands from the root of the repository you want to document:

```text
/autodocs                                  full set
/autodocs architecture                     only the architecture diagram
/autodocs flows the checkout and refund flows
/autodocs-runbook for on-call engineers
/autodocs-runbook text-only
/autodocs-confluence                       reuses docs/autodocs/ if it is current
/autodocs-confluence-upload                publishes to Confluence Cloud
/autodocs-readme emphasise local development
```

Output goes to `docs/autodocs/` unless you name another folder:

```text
docs/autodocs/
  runbook.md            full technical guide
  page.md               short plain-language page for Confluence
  diagrams/<name>.json | .html | .drawio | .png
  confluence/page.html  page.md  page.xhtml  attachments/  IMPORT.md
  .confluence.json      the page uploads go to; no secrets, safe to commit
  .checks/              generation check results (git-ignored)
```

The `.json` next to each diagram is its source: keep it, and re-running
`/autodocs` (or asking for a change to the diagram) regenerates the rest.

## Publishing to Confluence

**Direct upload (Confluence Cloud).** Run `/autodocs-confluence-upload`.

- **Token:** the first time, you run one login command in your terminal. It
  asks for an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
  with hidden input, checks it, and saves it in macOS Keychain, or in a private
  file in `~/.config/autodocs/` on other systems. Later runs reuse it without
  asking. `CONFLUENCE_BASE_URL`, `CONFLUENCE_USER` and `CONFLUENCE_API_TOKEN`
  take precedence, for CI.
- **Page:** it asks whether to create a new page or load into an existing one,
  then remembers the choice and updates that page from then on.
- **Your content is kept:** autodocs only changes its own marked block on the
  page. `--mode replace` overwrites the whole page, and only when you ask.
- **Easy to read:** the page is a short plain-language summary anyone can
  follow. The full technical runbook is attached to it.
- **Diagrams:** each one appears as an image, and its `.drawio`, interactive
  `.html` and `.png` are attached and listed in a Files table on the page. To make one a live draw.io diagram, use
  *Insert → draw.io Diagram → Import* with the attached file.

**Manual import, no API.** Follow `docs/autodocs/confluence/IMPORT.md`. In short:

1. Open `page.html` in a browser, copy everything, and paste it into a new
   Confluence page (or paste `page.md` as Markdown).
2. Drag the files in `attachments/` onto the page.
3. Replace each "Diagram" panel using *Insert → draw.io Diagram → Import* and
   the named `.drawio` file, or insert the matching `.png`.

## CLI

The agents run these for you. They also work by hand:

```bash
A=skills/autodocs/bin/autodocs.mjs
node $A finalize architecture docs/autodocs/diagrams/architecture.json docs/autodocs/diagrams/architecture.html --repo-root . --quality showcase --json
node $A drawio docs/autodocs/diagrams/architecture.html          # → architecture.drawio
node $A png docs/autodocs/diagrams/architecture.html             # → architecture.png
node $A runbook check docs/autodocs/runbook.md --repo-root .     # contract + citation check
node $A readme apply README.md block.md                          # insert/replace the managed block
node $A readme check README.md --repo-root .
node $A bundle docs/autodocs --repo-root .                       # drawio + png + checks + confluence/
node $A confluence status                                        # are credentials saved?
node $A confluence publish docs/autodocs --new --space ENG --dry-run   # preview an upload
node $A help-engine                                              # diagram engine commands
```

## Repository layout

| Path | Purpose |
|---|---|
| `skills/autodocs/SKILL.md` | `/autodocs`: full documentation run |
| `skills/autodocs-runbook/`, `autodocs-confluence/`, `autodocs-confluence-upload/`, `autodocs-readme/` | The focused commands; they use the engine in `skills/autodocs` |
| `skills/autodocs/references/` | Runbook and README authoring rules, diagram authoring rules |
| `skills/autodocs/bin/autodocs.mjs` | CLI: `drawio`, `png`, `runbook`, `readme`, `confluence`, `bundle`, plus the engine |
| `skills/autodocs/drawio/` | Rendered diagram → draw.io converter |
| `skills/autodocs/docs/` | Runbook/README checks, PNG export, Markdown → Confluence, Confluence upload |
| `skills/autodocs/renderers/`, `schemas/`, `bin/engine.mjs` | Diagram engine: rendering and validation |
| `.claude-plugin/` | Claude Code plugin and marketplace manifests |
| `install.mjs` | Installer for GitHub Copilot and Claude Code |
| `tests/` | `npm test` |

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
