---
name: autodocs
description: "Generate a complete, source-backed documentation set for a codebase: interactive HTML architecture and flow diagrams, editable draw.io (.drawio) files, and an implementation-level runbook (purpose, setup, configuration, usage, how it works, operations, troubleshooting), packaged for Confluence import. Use when the user runs /autodocs, asks to document a repository or service, wants architecture/workflow/sequence/data-flow/state diagrams or draw.io files, a runbook, or docs for Confluence. Also converts Mermaid into diagrams."
argument-hint: "[repo path] [architecture | flows | runbook | all] [notes for the docs]"
license: Apache-2.0
metadata:
  version: "0.2.0"
---

# autodocs

Produce documentation a team can publish: diagrams as interactive HTML and
editable `.drawio`, a runbook in Markdown, and a Confluence import folder.

Every command below runs `node <skill>/bin/autodocs.mjs`, where `<skill>` is
the absolute path of the folder containing this file. Run commands from the
target repository root unless told otherwise.

## Read the request

`/autodocs` takes free-form arguments. Interpret them as:

- **Target repository**: a path if given, else the current working directory.
- **Scope**: `all` (default), or any of `architecture`, `flows`, `runbook`. A
  named flow ("the checkout flow", "how jobs are retried") means that diagram.
  A request to draw one specific diagram produces only that diagram and its
  `.drawio`.
- **Output folder**: `docs/autodocs/` in the target repository unless the user
  names another. Reuse it on later runs; regenerate files in place.
- **Notes**: audience, emphasis, components to include or skip. Apply them.

Ask a question only when the target is ambiguous (for example several services
in one monorepo and no hint which one). Otherwise proceed.

## Output layout

```
<docs>/                       default docs/autodocs/
  runbook.md                  the runbook (Markdown, source of truth)
  diagrams/
    README.md                 what the three files per diagram are (from `bundle`)
    architecture.json         candidate (source of the diagram; keep it)
    architecture.html         interactive diagram
    architecture.drawio       editable draw.io file
    <flow-slug>.json|.html|.drawio
  confluence/                 written by `bundle`
    page.html                 runbook to open in a browser and copy-paste
    page.md                   runbook as Markdown
    page.xhtml                runbook in Confluence storage format
    attachments/              .drawio and .html files to attach
    IMPORT.md                 step-by-step import instructions
  .checks/                    engine check results; git-ignored
  .gitignore                  ignores .checks/
```

Send engine check results to `<docs>/.checks/<slug>/` with `--out-dir`. The
engine still writes `<slug>.delivery.json` beside the HTML; `bundle` moves every
leftover receipt and review folder into `.checks/`, so never point a reader at
them.

## Full documentation run

1. **Freeze identity and research.** Follow [Repository authoring](references/repository-authoring.md)
   step 1 for identity. Then read the repository as described in
   [Runbook authoring → Research](references/runbook-authoring.md#research-before-writing),
   recording `path:line` evidence as you go. One research pass serves every
   diagram and the runbook; do not re-read files you already cited.
   If the repository has no `origin` remote, diagram `sources` cannot be
   verified by the engine: omit `meta.repository` and every `sources` field,
   finalize without `--repo-root`, and keep the evidence as runbook citations
   (the runbook checker verifies those against the working tree).

2. **Choose the diagram set from what the code contains.**
   - One `architecture` diagram of the runtime system: entry points, services,
     stores, queues, external systems and trust/network boundaries.
   - Flow diagrams for the important behaviours a newcomer must understand,
     typically two to four. Pick the type by shape: `sequence` for a request or
     call chain across components, `workflow` for a process, CI/CD or job with
     decisions, `dataflow` for pipelines and lineage, `lifecycle` for a status
     or state machine, `erd` for the data model when the schema is central.
   - Skip a flow that the source cannot support with evidence. There is no
     count target.

3. **Author and finalize each diagram** using the engine rules below. Use
   `<docs>/diagrams/<slug>.json` as the candidate path and set `meta.output`
   to `<docs>/diagrams/<slug>.html` (relative to the working directory). Always
   pass `--repo-root <repo>`:

   ```bash
   node <skill>/bin/autodocs.mjs finalize <type> <docs>/diagrams/<slug>.json <docs>/diagrams/<slug>.html --repo-root <repo> --quality showcase --out-dir <docs>/.checks/<slug> --json
   node <skill>/bin/autodocs.mjs drawio <docs>/diagrams/<slug>.html
   ```

   Repair failed gates as the engine rules describe before moving on. Where
   those rules say `--out-dir <folder>/review-<n>`, use
   `--out-dir <docs>/.checks/<slug>/review-<n>`.
   Independent diagrams can be authored one after another without waiting for
   the runbook.

4. **Write the runbook** at `<docs>/runbook.md` following
   [Runbook authoring](references/runbook-authoring.md) exactly: front matter,
   required sections, real commands and configuration, cited implementation
   walkthrough, and links to every diagram (`diagrams/<slug>.drawio` plus the
   `.html`). Explain each flow diagram in the `## How it works` subsection that
   covers it.

5. **Bundle for Confluence** and fix every error it reports, then run it again:

   ```bash
   node <skill>/bin/autodocs.mjs bundle <docs> --repo-root <repo>
   ```

   `bundle` re-exports every diagram to `.drawio`, checks the runbook (sections,
   placeholders, broken links, citations against the repository) and writes
   `<docs>/confluence/`. A non-zero exit is never success.

## Partial runs

- **Architecture only / one diagram:** steps 1 (scoped to that slice), 3, then
  `drawio`. No runbook or bundle unless asked.
- **Runbook only:** steps 1 and 4, then `bundle`. If `diagrams/architecture.drawio`
  does not exist yet, make the architecture diagram first; the runbook must
  link it.
- **Existing docs folder:** update the affected diagrams and runbook sections
  for the new revision, bump `revision` and `generated`, then `bundle`.
- **Mermaid or a description instead of a repository:** use the engine rules
  without `--repo-root`; skip citations; still export `.drawio`.

## Confluence

Confluence does not read a repository folder directly. Tell the user to follow
`<docs>/confluence/IMPORT.md`. The simplest route needs no API: open
`page.html` in a browser, copy everything and paste it into a new page (or
paste `page.md` as Markdown), drag the files in `attachments/` onto the page,
then turn each diagram panel into a live draw.io diagram with
*Insert → draw.io Diagram → Import*. `page.xhtml` is for source editor apps and
the optional REST API route.
Standalone conversion is also available:

```bash
node <skill>/bin/autodocs.mjs confluence <file.md> [--out <file.xhtml>]
```

## Reply

Reply briefly in the user's language:

- Link the runbook and each diagram's HTML with descriptive titles and absolute
  paths; mention that each has a `.drawio` beside it.
- Point to `<docs>/confluence/IMPORT.md` for Confluence.
- State anything that changes how the docs should be read: parts of the
  system left out, facts the source did not show, illustrative rather than
  measured values, a dirty worktree.
- Say "Automated checks passed; not visually reviewed." unless you inspected
  captures. Do not paste the runbook or recap commands and receipts.

## Diagram authoring (engine rules)

Use this path for ordinary generation. Read branch references only when their stated trigger applies.

1. Choose `architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `class`, `tree`, `timeline`, or `waterfall` from the question.
2. Use the exact schema and example paths in the Type router without listing their directories. Read [Authoring defaults](references/authoring-defaults.md) and the mode's example in a bounded batch separate from project documents and complete schemas so neither is truncated; recover any missing section before writing. For Architecture, use the matching showcase example. For every mode except Architecture, also read the mode and common schemas. Read the relevant schema definition before choosing any new field, enum, or constrained text, especially boundary kinds. Examples teach shape, not facts. Use fresh IDs, wording, and layout. Go directly to the candidate without preliminary help, doctor, starter validation, temporary diagrams, or output-path listing. Query brands only for an explicitly requested mark; read [Brand marks](references/brand-marks.md) for an unknown mark with a user-provided URL.
3. Once the requested scope and, for a real codebase, [source evidence](references/repository-authoring.md) are covered, write the complete candidate directly without planning coordinates in prose. Choose Architecture abstraction and connected placement using Authoring defaults before coordinates: show the main user journey and necessary branches, preserve control roles and behavior-changing conditions, and leave enough room for actual relationship labels. No node, relationship, source, view, card, or boundary count is a target or ceiling. Use automatic routes first; add explicit routing only for necessary branch, return, supplied geometry, or measured repair. Set `meta.quality_profile` to `"showcase"` unless the user requests dense `standard`. For ERD, use a table-first layout: show every physical column in `entities[].attributes`, keep its SQL type and source comment, state every key role a column carries (`key` takes a role or a list, so a junction column is `["pk", "fk"]`, and every `fk` column also needs `references` like `"orders.id"`), and never move columns into cards as a substitute for the table. Classify tables into functional domains before placement, give each domain a concise `tag`, and place its members in one solid rectangle of grid cells — a single row, a single column, or a filled rectangular block, not an L or diagonal. A tagged table always needs `row`/`col`, because absolute coordinates have no grid cells and a domain whose tables do not fill one rectangle cannot be drawn as a band: the renderer reports `erd/domain-not-drawn` instead of publishing a diagram that cannot name the domain. A multi-domain schema reads best as one domain per column — each `tag` a vertical run — because the reader scales a wide canvas up to the reader width and shrinks a tall one until the page fits, so the wide arrangement is the one that stays complete and legible inside a laptop viewport. A schema-first ERD over roughly 8 tables or 50 fields is itself a dense map: author its first complete-field pass at `standard` and upgrade only once the layout still reads.
4. Once the complete first candidate is written, run `finalize` directly. Its first gate is showcase validation; successful first drafts need no separate pre-validation. Keep the candidate unchanged while the command runs:

   ```bash
   node bin/autodocs.mjs finalize <type> <candidate.json> <output.html> --quality showcase --json
   ```

   For a repository-backed candidate, include evidence on the first draft and use the complete first command: `node bin/autodocs.mjs finalize <type> <candidate.json> <output.html> --repo-root <repo-root> --quality showcase --json`. Pass the `--quality` that matches `meta.quality_profile`, such as `standard` for a dense first ERD pass.

   A passing receipt proves the included `validate`, `deliver`, strict `check`, and real-browser `browser-check` gates passed. Use its compact summary; run standalone commands only for a separate request or focused failure diagnosis.

5. A non-zero exit is never success. Read compact stdout or `evidence.summaryReceipt`, then [repair the failed gate](references/delivery-contract.md#failed-finalize-and-candidate-repair), including its repair limit. Preserve requested meaning and source evidence. For several tangled Architecture routes, read [Architecture layout repair](references/architecture-layout-repair.md); for measured field or geometry failures, read [Authoring contract](references/authoring-contract.md). Edit the connected neighborhood and rerun the complete `finalize` command from step 4. Once a run has reached `browser-check`, the output path owns that evidence: give every later run its own `--out-dir <folder>/review-<n>`.

## Type router

| Type | Use for | Schema | Example |
|---|---|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure; what something everyday is made of | `schemas/architecture.schema.json` | System descriptions, services, libraries, and CLI repos: `examples/web-app.architecture.json`; deployment repos: `examples/production-deployment.architecture.json` |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD; plans and step-by-step life processes | `schemas/workflow.schema.json` | `examples/agent-tool-call.workflow.json` |
| `sequence` | API call chains, request lifecycles, async traces, returns; back-and-forth between people | `schemas/sequence.schema.json` | `examples/cache-miss-request.sequence.json` |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers; where money or documents go | `schemas/dataflow.schema.json` | `examples/product-analytics.dataflow.json` |
| `lifecycle` | State/status transitions, retries, waiting and terminal states; where an application or order stands | `schemas/lifecycle.schema.json` | `examples/deployment-release.lifecycle.json` |
| `erd` | Tables/entities, attributes, primary/foreign/unique keys, cardinality between them | `schemas/erd.schema.json` | `examples/orders.erd.json` |
| `tree` | Single-parent containment: repository/module trees, capability or feature breakdowns, org-style decomposition | `schemas/tree.schema.json` | `examples/payment-platform.tree.json` |
| `class` | Classes, interfaces, selected members, and dependency/association/inheritance/realization/composition between types | `schemas/class.schema.json` | `examples/payments.class.json` |
| `timeline` | When things happened: incident reviews, release histories, timestamped events on a proportional clock with source lanes | `schemas/timeline.schema.json` | `examples/payment-incident.timeline.json` |
| `waterfall` | Where the time went: span durations, overlap, and nesting of one request or agent run on a common time axis | `schemas/waterfall.schema.json` | `examples/checkout-request.waterfall.json` |

When choosing among native diagram types is ambiguous, run `node bin/autodocs.mjs guide "<scenario>" --json`. Scenario proof examples are structural references, not facts to copy.

For an everyday subject, keep the same diagram modes and semantic types, then name them for the reader: use everyday `icon` values and `meta.legend` labels as in [Node icons](references/authoring-contract.md#node-icons). Ask for missing personal facts instead of inventing dates, amounts, or rules.

## Mermaid input

Read Mermaid for topology and meaning, then author fresh candidate JSON; do not mechanically render Mermaid styling.

- `flowchart` / `graph` → `workflow`, or `architecture` for a component map.
- `sequenceDiagram` → `sequence`; participants become semantic participants and arrows become messages.
- `stateDiagram` → `lifecycle`; states and transitions retain meaning, not Mermaid style.
- `erDiagram` → `erd`; entity and relationship names, keys, and cardinality retain meaning, not Mermaid style.
- `classDiagram` → `class`; type kinds, selected members, and relationship kinds retain meaning, not Mermaid style.

## Delivery

Use the `finalize` command above for the first candidate and after a repair.

`finalize` stops at the first non-passing gate. Its compact stdout and `<output-stem>.finalize-summary.json` are ordinary evidence. A passing run creates no screenshots and reports `visualReview: "not-requested"`.

When a passing Architecture receipt reports `visualReviewRecommendation.signals.resolvedCrossovers`, copy the candidate aside and apply the hints in one edit that changes only node positions and sizes: every node, relationship (including its `from` and `to`), label, and source stays as it was. Rerun the complete `finalize` once with `--out-dir <folder>/review-2`, because the previous HTML already owns its browser evidence. `--out-dir` relocates the new browser-check and default finalize receipts, not the HTML or its delivery receipt. Successful delivery rewrites that pair at the requested output path; earlier review evidence remains bound to its original artifact bytes. See [review evidence paths](references/delivery-contract.md#a-new-candidate-at-an-existing-output-path). If that run fails, reports more crossings, or reports the same crossings with more `signals.routesOverSuggestedBends`, restore the copy and finalize it with `--out-dir <folder>/review-3`. Do not start a second placement round. Hints about extra bends alone are optional.

When `layoutReviewRecommendation.action` is `inspect-sequence-width`, follow [Sequence width review](references/delivery-contract.md#sequence-width-review) before handing off a newly authored Sequence.

Perceptual review is optional for ordinary generation, including a newly positioned Architecture. Use [Optional capture evidence](references/delivery-contract.md#optional-capture-evidence), with `--out-dir <folder>/visual-check`, when the user requests visual review, during development audits, or for a concrete route/browser concern. `visualReviewRecommendation` is advisory. Inspect captures before claiming visual quality; qualify any check claim as automated when perceptual review has not occurred.

Read [Delivery contract](references/delivery-contract.md) for failed gates, standalone commands, provenance/recovery, repeated delivery, exports, or opening. Native diagram recovery follows `deliver` → strict provenance `check` → `browser-check`; captures require strict provenance.

For workflow viewport overflow, read [Workflow viewport repair](references/authoring-contract.md#workflow-viewport-repair) before the next layout edit.

When reporting verification details, distinguish artifact checks, browser evidence, captures, and actual perceptual review. For an explicitly requested immediate preview or active desktop loop, see [Optional opening](references/delivery-contract.md#optional-opening).

## Optional viewer capabilities

Live motion is enabled by default for every rendered diagram; omit `meta.animation`. The Viewer’s Live/Still button controls playback.

Read `references/viewer-runtime.md` only when the user explicitly asks for Share Cards, Route/Reach cards, motion, deep links, presentation, search/focus, or another Viewer Runtime feature.

## Setup and fallback

No install is required inside the skill package. For setup diagnosis, verify with:

```bash
node bin/autodocs.mjs doctor
node bin/autodocs.mjs demo <output-directory>
```

For native diagrams, when shell access is unavailable, hand-place architecture SVG into `assets/template.html`, use CSS semantic classes rather than inline colors, and follow the visual review contract in `references/delivery-contract.md`. 
