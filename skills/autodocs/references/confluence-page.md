# Writing the Confluence page

Write `<docs>/page.md`. This is the page people actually read in Confluence.
Anyone in the company should understand it, including people who have never
seen the code. The technical runbook is attached to the page for engineers, so
leave technical detail out of this page.

Base it only on what you learned from the source. Never invent a fact to make
the page read better.

## Shape

Start with this front matter, using the same `repository` and `revision` as the
runbook:

```yaml
---
title: <Project name>
repository: <same as runbook>
revision: <same as runbook>
generated: <YYYY-MM-DD>
---
```

Then `# <Project name>` and these sections, in order. Aim for 300 to 600 words.
Leave out a section that has nothing useful to say.

| Section | What goes in it |
|---|---|
| `## What is this?` | Two or three sentences: what it does and why it exists |
| `## How it works` | The main diagram, then 4 to 7 numbered steps in everyday words |
| `## What can happen` | A table of outcomes: result, what it means, who acts |
| `## Status today` | Only if something is broken or unfinished. Use a `> [!WARNING]` callout and say it plainly |
| `## Good to know` | Up to five facts that affect people, such as cost, safety or limits |
| `## Words you might see` | A table explaining each product name or term the page uses |

Put the main diagram on its own line, as a link to its `.drawio` file, with a
label that says what the picture shows:

```markdown
[How a file moves through the system](diagrams/architecture.drawio)
```

Show only the diagrams a general reader needs, usually one. The others are still
attached and listed in the Files table that is added to the page automatically.

## How to write

- Use short sentences and everyday words.
- Say what a thing does before you name it, for example: "Airflow, the scheduler
  that runs each step, checks for new files every 2 minutes."
- Write about what people see and do, not how the code is built.
- Be honest about what does not work yet.

## Leave out

- File paths, line numbers and source citations
- Commands, configuration keys and environment variables
- Class, function, table and API names, unless people really see them
- Abbreviations you have not explained
- Text that only makes sense if you have read the code

## Check before finishing

Read the page as someone who joined last week and has never opened the
repository. If a sentence would make them stop and ask what it means, rewrite it.
