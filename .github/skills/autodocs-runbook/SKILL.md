---
name: autodocs-runbook
description: "Write only the runbook for a codebase: an implementation-level runbook.md (purpose, architecture, prerequisites, setup, configuration, usage, how it works with verified source citations, operations, troubleshooting, source map) with the architecture diagram. Use when the user runs /autodocs-runbook or asks for just a runbook, operations guide or onboarding doc, not the full documentation set."
argument-hint: "[repo path] [text-only] [notes, e.g. audience]"
license: Apache-2.0
metadata:
  version: "0.3.0"
---

# autodocs-runbook

Produce `<docs>/runbook.md` and, unless the user says `text-only`, the
architecture diagram it links. Nothing else: no flow diagrams, no Confluence
bundle, no README changes.

`<engine>` is the `autodocs` skill folder next to this one (`../autodocs`
relative to this file); resolve it to an absolute path. Run commands from the
target repository root. `<docs>` is `docs/autodocs/` unless the user names
another folder.

## Steps

1. **Research.** Follow `<engine>/references/runbook-authoring.md`
   (identity, research order, `path:line` evidence). Read
   `<engine>/references/repository-authoring.md` step 1 for repository identity.

2. **Architecture diagram** (skip for `text-only`, or when
   `<docs>/diagrams/architecture.html` already exists for this revision). Author
   and finalize it exactly as `<engine>/SKILL.md` describes under "Full
   documentation run" step 3 and its engine rules, then export it:

   ```bash
   node <engine>/bin/autodocs.mjs drawio <docs>/diagrams/architecture.html
   node <engine>/bin/autodocs.mjs png <docs>/diagrams/architecture.html
   ```

3. **Write `<docs>/runbook.md`** following `runbook-authoring.md` exactly. Link
   `diagrams/architecture.drawio` and `diagrams/architecture.html` in
   `## Architecture`. For `text-only`, describe the architecture in prose and a
   component table instead.

4. **Check** and fix every error, then check again:

   ```bash
   node <engine>/bin/autodocs.mjs runbook check <docs>/runbook.md --repo-root .
   node <engine>/bin/autodocs.mjs runbook check <docs>/runbook.md --repo-root . --text-only   # text-only runs
   ```

## Reply

One or two lines: link the runbook (absolute path), mention the architecture
diagram if made, and anything the source did not show. Mention that
`/autodocs-confluence` packages it for Confluence and `/autodocs-readme` puts a
summary in the README.
