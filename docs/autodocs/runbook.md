---
title: autodocs runbook
repository: https://github.com/shivatarunkumar/-auto-docs.git
revision: 0830f40eb52f34d30c63fd94d387b21ad8209a41
generated: 2026-11-08
---

# autodocs

## Overview

autodocs generates documentation for a codebase from its source. It runs inside a coding agent, either Claude Code or GitHub Copilot, and produces diagrams, a runbook, a README block and a package for importing into Confluence.

It solves the problem of architecture documents that drift away from the code. Every runbook citation names a file and line range that a checker confirms exists, and diagram elements carry source references that the engine verifies against a pinned commit.

Engineers use it through slash commands in their agent. It is not a hosted service, a documentation site generator or a CI product, and at this revision it makes no network calls of its own.

Key capabilities:

- Interactive HTML diagrams with editable draw.io and PNG copies.
- A runbook checked for required sections, placeholders, broken links and citations.
- A managed README block that leaves the rest of the README untouched.
- A Confluence folder that can be imported by copy and paste, with no API.

In short: an engineer asks their coding agent to document a repository, and gets diagrams and an operations guide that can be traced back to the code and pasted into Confluence.

## Architecture

[Architecture diagram](diagrams/architecture.drawio)

[Interactive architecture diagram](diagrams/architecture.html)

The agent reads a skill file for instructions, then does all of the work by running the CLI in a shell.

| Component | Responsibility | Technology | Code |
|---|---|---|---|
| Skill files | Step-by-step instructions for each slash command | Markdown with YAML front matter | `skills/autodocs/SKILL.md:65-119` |
| CLI | Parses documentation commands and passes everything else to the engine | Node.js ES modules | `skills/autodocs/bin/autodocs.mjs:363-374` |
| draw.io exporter | Reads a rendered diagram's SVG and writes a draw.io file | Node.js | `skills/autodocs/drawio/export-drawio.mjs:49-53` |
| Runbook checker | Enforces the runbook and README contracts | Node.js | `skills/autodocs/docs/runbook-check.mjs:140-182` |
| Confluence exporter | Converts the runbook's Markdown to storage format and HTML | Node.js | `skills/autodocs/docs/confluence.mjs:36-52` |
| PNG exporter | Screenshots a rendered diagram through a headless browser | Chrome DevTools Protocol | `skills/autodocs/docs/png-export.mjs:45-80` |
| Diagram engine | Validates, renders and browser-checks diagrams | Node.js | `skills/autodocs/bin/finalize.mjs:22` |
| Installer | Copies the skills into a Copilot or Claude Code folder | Node.js | `install.mjs:47-79` |

External dependencies and boundaries:

- **Chromium browser:** the only external program. The engine's browser check and the PNG exporter both need it.
- **Target repository:** read from the local disk. Citations are checked against the working tree, and diagram sources against committed content.
- **Network and data:** no code on the main path sends documents anywhere. Confluence import is done by a person.

The steps of the packaging command are shown in the bundle workflow, explained in [How it works](#how-it-works).

## Prerequisites

- Node.js 18 or newer (`package.json:7`).
- Chrome, Edge or Chromium. Set `AUTODOCS_CHROME` if it is not found automatically (`skills/autodocs/bin/visual-check.mjs:1317-1328`).
- Claude Code or GitHub Copilot in VS Code, with permission to run terminal commands.
- The *draw.io Diagrams for Confluence* app, only if diagrams should be live and editable inside Confluence pages.

No accounts, credentials or runtime npm packages are needed for the documentation commands.

## Installation and setup

For Claude Code, install the plugin and restart the agent (`README.md:55-58`):

```bash
claude plugin marketplace add shivatarunkumar/-auto-docs
claude plugin install autodocs@autodocs
```

For GitHub Copilot, clone the repository and run the installer (`README.md:74-78`):

```bash
git clone https://github.com/shivatarunkumar/-auto-docs.git autodocs
node autodocs/install.mjs --agent copilot
```

Add `--project <path>` to install into one repository instead of your user folder. Add `--force` to replace an existing install, and `--uninstall` to remove it (`install.mjs:28-40`).

To check the setup from a clone, run the engine's diagnostics:

```bash
node skills/autodocs/bin/autodocs.mjs doctor
```

## Configuration

autodocs has no configuration file. Behaviour is set by command arguments and these environment variables.

| Variable / key | Required | Default | Purpose | Read at |
|---|---|---|---|---|
| `AUTODOCS_CHROME` | No | Searches standard install paths | Path to the browser executable | `skills/autodocs/bin/visual-check.mjs:1327-1328` |
| `AUTODOCS_CHROME_NO_SANDBOX` | No | Unset | Named switch for running the browser without its sandbox | `skills/autodocs/bin/visual-check.mjs:50` |
| `AUTODOCS_CHECK_MAX_BUFFER` | No | Engine default | Output buffer limit for engine checks | `skills/autodocs/bin/engine.mjs:2282` |

The output folder is `docs/autodocs/` unless the user names another (`skills/autodocs-confluence/SKILL.md:15-18`). There are no secrets to manage at this revision.

## Usage

Run these in your agent from the root of the repository you want to document (`README.md:94-100`):

```text
/autodocs                        full set
/autodocs architecture           only the architecture diagram
/autodocs-runbook                runbook with the architecture diagram
/autodocs-confluence             Confluence package
/autodocs-readme                 managed README block
```

Results are written under `docs/autodocs/`: the runbook, a `diagrams/` folder and a `confluence/` folder.

The agent runs these commands for you, and they also work by hand:

```bash
A=skills/autodocs/bin/autodocs.mjs
node $A drawio docs/autodocs/diagrams/architecture.html
node $A png docs/autodocs/diagrams/architecture.html
node $A runbook check docs/autodocs/runbook.md --repo-root .
node $A bundle docs/autodocs --repo-root .
```

`bundle` prints `PASS` and exits 0 when the runbook passes its checks.

To put the result in Confluence, open the generated page in a browser, copy it into a new Confluence page, attach the files from `confluence/attachments/`, then import each draw.io file. The generated import guide has the full steps.

## How it works

### Command routing

The CLI handles the documentation commands itself and sends anything else to the engine as a child process (`skills/autodocs/bin/autodocs.mjs:358-374`). Options are parsed strictly, and an unknown flag exits with code 2 (`skills/autodocs/bin/autodocs.mjs:42-60`).

### Producing a diagram

The agent writes a JSON candidate, then runs `finalize`. It runs four gates in order: validate, deliver, check and browser-check (`skills/autodocs/bin/finalize.mjs:22`). The result is a self-contained HTML file. The draw.io exporter then reads nodes, edges and frames back out of that HTML's SVG (`skills/autodocs/drawio/export-drawio.mjs:54-59`) and writes the draw.io XML (`skills/autodocs/drawio/export-drawio.mjs:220-294`).

### Bundling for Confluence

[Bundle workflow diagram](diagrams/bundle-workflow.drawio)

[Interactive bundle workflow diagram](diagrams/bundle-workflow.html)

`bundle` is the last step of every documentation run (`skills/autodocs/bin/autodocs.mjs:263-356`):

1. It finds rendered diagrams and writes a fresh draw.io file for each (`skills/autodocs/bin/autodocs.mjs:269-290`).
2. It exports PNGs unless `--no-png` is set. A missing browser becomes a warning, not a failure (`skills/autodocs/bin/autodocs.mjs:291-298`).
3. It moves engine check results into the git-ignored `.checks/` folder (`skills/autodocs/bin/autodocs.mjs:234-261`).
4. It checks the runbook (`skills/autodocs/bin/autodocs.mjs:309-311`).
5. It deletes and rebuilds the Confluence folder, with attachments flattened to one level (`skills/autodocs/bin/autodocs.mjs:313-343`).
6. It reports results and sets the exit code (`skills/autodocs/bin/autodocs.mjs:345-355`).

> [!IMPORTANT]
> The Confluence folder is written even when the runbook fails its checks. Treat any non-zero exit as not ready to publish.

### Runbook checks

The checker requires the sections listed in its contract (`skills/autodocs/docs/runbook-check.mjs:11-22`), rejects placeholder text (`skills/autodocs/docs/runbook-check.mjs:91-95`) and confirms that local links resolve (`skills/autodocs/docs/runbook-check.mjs:132-138`). Citation checks confirm that each file exists inside the repository and that the line range is within it (`skills/autodocs/docs/runbook-check.mjs:97-119`). They do not confirm that the cited lines support the claim, so that remains the author's responsibility.

### Confluence conversion

The exporter converts front matter, headings, tables, code, callouts and links to storage format (`skills/autodocs/docs/confluence.mjs:36-52`). A paragraph that is only a draw.io link becomes an info panel explaining how to import the file (`skills/autodocs/docs/confluence.mjs:263-273`). The same storage format is also rendered to copy-pasteable HTML (`skills/autodocs/docs/confluence.mjs:297-348`).

### README block

A README update replaces only the text between the autodocs markers (`skills/autodocs/docs/runbook-check.mjs:223-244`).

### Error handling and security

Non-zero exits are the failure signal for every command, and the skills tell the agent to treat them as failures (`skills/autodocs-confluence/SKILL.md:38-42`). There are no background jobs, retries, persistent stores or concurrency controls in the documentation commands. Citations that resolve outside the repository are rejected (`skills/autodocs/docs/runbook-check.mjs:104-108`).

## Deployment and operations

autodocs is released as a Claude Code plugin from this repository, described by the plugin manifests (`.claude-plugin/plugin.json:1-4`). The source shows no CI pipeline, automated release process, metrics or alerts. Users update through their agent's plugin commands (`README.md:67-70`), or with `git pull` and the installer's `--force` flag (`README.md:86-88`).

Run the tests before releasing:

```bash
npm test
```

The tests cover draw.io export, Confluence conversion, the runbook checks, the installer and PNG export (`tests/autodocs.test.mjs:22-210`).

To roll back, install an earlier commit of the repository. Generated docs are plain files in the target repository, so git handles their backup and restore.

## Troubleshooting

| Symptom | Likely cause | How to confirm | Fix |
|---|---|---|---|
| Bundle warns that PNG export was skipped | No browser found (`skills/autodocs/docs/png-export.mjs:46-47`) | Run the `doctor` command | Install Chrome or set `AUTODOCS_CHROME` |
| Bundle exits 1 | The runbook failed its checks | Read the `error` lines in the output | Fix each error and run it again |
| Citation "is outside the file" | Line numbers changed since writing (`skills/autodocs/docs/runbook-check.mjs:115-116`) | Open the file at the cited lines | Update the citation |
| Bundle warns that two attachments share a name | Confluence keeps one name per page (`skills/autodocs/bin/autodocs.mjs:324-327`) | Read the warning | Rename one of the files |
| "No rendered diagram SVG" | The input is not a rendered diagram (`skills/autodocs/drawio/export-drawio.mjs:55-56`) | Open the HTML in a browser | Run `finalize` again |
| A Confluence diagram panel shows only instructions | The draw.io file has not been imported yet | Look for the "Diagram:" panel title | Use *Insert → draw.io Diagram → Import*, or insert the PNG |
| Copilot does not list the commands | Skills are not enabled | Check `chat.useAgentSkills` (`README.md:83-84`) | Enable it and reload the window |
| Installer reports `exists` | A previous install is present (`install.mjs:66-70`) | Read the output | Run it again with `--force` |

## Source map

| Path | Responsibility |
|---|---|
| `skills/autodocs/SKILL.md` | Full documentation run and diagram authoring rules |
| `skills/autodocs-confluence/SKILL.md` | Confluence package command |
| `skills/autodocs-readme/SKILL.md` | README command |
| `skills/autodocs-runbook/SKILL.md` | Runbook command |
| `skills/autodocs/bin/autodocs.mjs` | Documentation CLI |
| `skills/autodocs/bin/engine.mjs` | Diagram engine commands |
| `skills/autodocs/bin/finalize.mjs` | Diagram delivery gates |
| `skills/autodocs/docs/confluence.mjs` | Markdown to Confluence conversion |
| `skills/autodocs/docs/runbook-check.mjs` | Runbook and README checks |
| `skills/autodocs/docs/png-export.mjs` | PNG export |
| `skills/autodocs/drawio/export-drawio.mjs` | draw.io export |
| `install.mjs` | Installer |
| `tests/autodocs.test.mjs` | Test suite |

Where to start for common changes:

- To add a documentation command, add a handler and a case in the switch in `skills/autodocs/bin/autodocs.mjs:363-374`.
- To add a slash command, create a folder under `skills/` with a SKILL.md. The installer picks it up automatically (`install.mjs:21`).
- To change a required runbook section, edit `skills/autodocs/docs/runbook-check.mjs:11-22`.
- To change how Markdown appears in Confluence, edit `skills/autodocs/docs/confluence.mjs:54-118`.
