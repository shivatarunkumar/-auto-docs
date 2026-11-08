---
name: autodocs-readme
description: "Update a repository's README.md with complete, source-backed project documentation (overview, architecture diagram image, quick start, configuration, usage, troubleshooting) inside an autodocs-managed block, leaving the rest of the README untouched. Use when the user runs /autodocs-readme or asks to write, refresh or improve the README from the code."
argument-hint: "[repo path] [notes, e.g. sections to emphasise]"
license: Apache-2.0
metadata:
  version: "0.3.0"
---

# autodocs-readme

Update `README.md` at the target repository root with a managed documentation
block and an architecture diagram image. Only the text between
`<!-- autodocs:start -->` and `<!-- autodocs:end -->` is yours.

`<engine>` is the `autodocs` skill folder next to this one (`../autodocs`
relative to this file); resolve it to an absolute path. Run commands from the
target repository root. Diagrams live in `<docs>/diagrams/`, where `<docs>` is
`docs/autodocs/` unless the user names another folder.

## Steps

1. **Read the existing README first** and note what it already covers outside
   the managed block, so the block does not duplicate it.

2. **Research** as `<engine>/references/readme-authoring.md` describes. If
   `<docs>/runbook.md` exists for the current revision, reuse its facts instead
   of re-reading the same code.

3. **Architecture diagram and PNG.** Reuse `<docs>/diagrams/architecture.html`
   when it matches the current revision; otherwise author and finalize it as
   `<engine>/SKILL.md` describes under "Full documentation run" step 3. Then:

   ```bash
   node <engine>/bin/autodocs.mjs drawio <docs>/diagrams/architecture.html
   node <engine>/bin/autodocs.mjs png <docs>/diagrams/architecture.html
   ```

4. **Write the block** following `readme-authoring.md` to a temporary file
   outside the repository (for example in your scratch or temp directory), with
   links relative to the README. Then apply and check it:

   ```bash
   node <engine>/bin/autodocs.mjs readme apply README.md <block.md> --title "<Project>"
   node <engine>/bin/autodocs.mjs readme check README.md --repo-root .
   ```

   Fix every error by editing the block file and applying it again. Delete the
   temporary file when done.

## Reply

One or two lines: link the README (absolute path), say whether the block was
added or replaced, and note anything left out because the existing README
already covers it. Mention that the rest of the README was not changed.
