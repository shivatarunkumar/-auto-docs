---
name: autodocs-confluence
description: "Produce a Confluence-ready documentation package for a codebase: page.html to copy-paste, page.md, page.xhtml (storage format), draw.io diagrams, PNG images and step-by-step IMPORT.md. Reuses existing autodocs output when present. Use when the user runs /autodocs-confluence or asks for docs to put in Confluence, a Confluence page, or draw.io files for Confluence."
argument-hint: "[repo path] [notes for the page]"
license: Apache-2.0
metadata:
  version: "0.3.0"
---

# autodocs-confluence

Deliver `<docs>/confluence/`: the page in three formats, every diagram as
`.drawio`, `.png` and `.html` attachments, and `IMPORT.md`.

`<engine>` is the `autodocs` skill folder next to this one (`../autodocs`
relative to this file); resolve it to an absolute path. Run commands from the
target repository root. `<docs>` is `docs/autodocs/` unless the user names
another folder.

## Decide what to generate

- **`<docs>/runbook.md` and its diagrams already exist and match the current
  revision** (compare the runbook's `revision` with `git rev-parse HEAD`, or the
  user says to reuse them): skip straight to *Bundle*.
- **They exist but are older:** update the affected diagrams and runbook
  sections for the new revision first, as in `<engine>/SKILL.md` under
  "Partial runs → Existing docs folder".
- **Nothing exists:** run the full documentation run in `<engine>/SKILL.md`
  (steps 1–4: research, diagrams, runbook). The Confluence page is the runbook,
  so it is required.

## Bundle

```bash
node <engine>/bin/autodocs.mjs bundle <docs> --repo-root .
```

`bundle` re-exports every diagram to `.drawio` and `.png`, checks the runbook,
writes `<docs>/confluence/` and moves engine check results into the
git-ignored `<docs>/.checks/`. Fix every error and run it again; a non-zero
exit is never success. If it warns that PNG export was skipped (no Chrome),
say so in the reply.

## Reply

Two or three lines: link `<docs>/confluence/IMPORT.md` and `page.html`
(absolute paths), and summarise the simplest import route: open `page.html`,
copy everything into a new Confluence page, drag in `attachments/`, then import
each `.drawio` with *Insert → draw.io Diagram → Import* (or insert the `.png`
when the draw.io app is not installed).
