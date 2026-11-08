# Runbook authoring

Read this before writing `runbook.md`. The runbook is the main page of the
documentation set: a new engineer or on-call operator must be able to learn
what the project is for, run it, change it, and fix it from this page and its
diagrams alone, without reading the code first.

## Audience and voice

- Write for an engineer who is new to this repository but not to the stack.
- Lead each section with what the reader does or needs to know; explain why
  only where the reason changes what they do.
- Use the project's real names: commands, environment variables, file paths,
  endpoints, queue and table names. Never invent a value. If the source does
  not show something (a port, a default, a deploy target), say so in one line
  rather than guessing.
- Keep it current with the pinned revision. Everything you state must hold at
  `revision` in the front matter.

## Research before writing

Use the same evidence discipline as diagrams ([Repository authoring](repository-authoring.md)):

1. Freeze identity: `git rev-parse HEAD`, `git remote get-url origin` (strip any
   credentials), `git status --short`. Mention dirty paths in your reply.
2. Read, in this order, only as far as needed: README and docs, manifests
   (`package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `Cargo.toml`, ...),
   entry points (`main`, `bin`, `cmd/`, server bootstrap, CLI parser), configuration
   loading (env parsing, config files, defaults), the modules on the main request
   or job path, persistence and external clients, build/CI/deploy files
   (`Dockerfile`, compose, Helm/Kubernetes, Terraform, `.github/workflows`), tests
   that show intended usage.
3. While reading, record each fact with its `path:line` range. These become the
   citations the checker verifies.
4. Collect every configuration key: name, where it is read, default, whether it
   is required, and what it changes.
5. Collect the real commands for install, build, test, run, lint and deploy from
   manifests, Makefiles, scripts and CI — not from memory of the ecosystem.
6. Collect failure modes from error handling, retries, health checks, logs and
   existing issue or troubleshooting notes.

## File shape

`runbook.md` starts with YAML front matter. All four keys are required:

```yaml
---
title: <Project name> runbook
repository: <credential-free origin URL, or the local folder name>
revision: <40-character commit hash>
generated: <YYYY-MM-DD>
---
```

Then one `# <Project name>` title, then these `##` sections in this order. The
checker matches headings by meaning, so the names below are the recommended
wording. Every required section needs real content; when a section genuinely
does not apply, keep it and state why in one sentence.

| Section | Required | What it must contain |
|---|---|---|
| `## Overview` | yes | What the project is, the problem it solves, who uses it, and what it is not. Key capabilities as a short list. One-paragraph summary a manager could read. |
| `## Architecture` | yes | The architecture diagram as `[Architecture diagram](diagrams/architecture.drawio)` plus a link to the interactive `.html`. Then each major component: responsibility, technology, owning code path. External dependencies and boundaries (network, trust, data). Link each flow diagram where it is explained. |
| `## Prerequisites` | yes | Runtimes and versions (from manifests/engines/CI), tools, accounts, credentials, network access, permissions. |
| `## Installation and setup` | yes | Exact, copy-pasteable steps from a clean machine to a working local instance, in order, with expected output where useful. |
| `## Configuration` | yes | Table: `Variable / key`, `Required`, `Default`, `Purpose`, `Read at` (citation). Config files and precedence. Secrets handling. |
| `## Usage` | yes | How to use the project for its main jobs: commands, API calls or UI steps with real examples and expected results. Common recipes. |
| `## How it works` | yes | The implementation walkthrough: entry point → main path → persistence/side effects, one `###` subsection per important flow, each linking its flow diagram and citing the code (`path/file.ext:start-end`). Data model, background jobs, error handling and retries, concurrency, security controls. This section must cite source. |
| `## Deployment and operations` | recommended | Build and release process, environments, deploy commands, health checks, logs, metrics, alerts, scaling, backup/restore, rollbacks. |
| `## Troubleshooting` | yes | Table or `###` entries: symptom → likely cause → how to confirm → fix. Derive them from real error paths, health checks and known issues. |
| `## Source map` | yes | Table of the important directories and files: path, responsibility. Where to start for common changes ("to add an endpoint, edit …"). |

Optional sections after these: `## Testing`, `## Security`, `## FAQ`, `## Glossary`.

## Citations

Cite source in backticks as `path/from/repo/root.ext:12` or
`path/from/repo/root.ext:12-40`, copying line numbers from what you read
(`nl -ba <file> | sed -n '40,90p'`). Put citations next to the claim they support,
for example: "Requests are authenticated before routing (`src/server.ts:41-58`)."
Cite the code that performs an action, not a caller that mentions it.
`autodocs runbook check --repo-root` fails on citations to missing files or
out-of-range lines.

## Diagrams in the runbook

Link diagrams with paths relative to `runbook.md`:

```markdown
[Architecture diagram](diagrams/architecture.drawio) · [interactive view](diagrams/architecture.html)
```

A paragraph that contains only a link to a `.drawio` file becomes a draw.io
import panel in Confluence, so put each diagram link on its own line.

## Confluence-friendly Markdown

The Confluence exporter supports headings, lists (nested and task lists), GFM
tables, fenced code with a language, links, images, horizontal rules and these
callouts, which become Confluence panels:

```markdown
> [!NOTE]
> Informational panel.

> [!WARNING]
> Red warning panel: data loss, downtime, security.
```

`[!TIP]` and `[!IMPORTANT]` are also supported. Always give fenced code a
language (`bash`, `yaml`, `json`, `ts`, `py`, ...). Avoid raw HTML, footnotes
and Mermaid; draw diagrams with autodocs instead.

## Before handing off

Run the checker and fix every error:

```bash
node <skill>/bin/autodocs.mjs runbook check <docs>/runbook.md --repo-root <repo-root>
```

Warnings are advisory; resolve the ones that are cheap to fix.
