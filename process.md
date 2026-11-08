# How autodocs works

This page explains what happens behind the scenes when someone uses autodocs,
where their data goes, and whether it is safe.

## The short explanation

> autodocs is a set of instructions and tools that plug into an AI coding
> assistant, such as GitHub Copilot or Claude Code. The AI reads your code and
> writes the documentation. autodocs's own programs then draw the diagrams, check
> the work and package it for Confluence. autodocs has no server of its own. It
> runs on your computer.

## The two halves

autodocs only works because two different things cooperate.

| | The AI assistant | The autodocs programs |
|---|---|---|
| **What it is** | Copilot or Claude Code | `.mjs` files that run on your computer with Node.js |
| **What it does** | Reads code, understands it, writes the text and describes the diagrams | Draws the diagrams, checks the docs, exports files, uploads to Confluence |
| **Where it runs** | Partly on the AI provider's servers | Entirely on your computer |
| **Can it make things up?** | Yes, so its work needs checking | No, it follows fixed rules |

The `SKILL.md` files connect the two. Each one is a written set of steps that
tells the AI what to do and which program to run.

## What happens when you type `/autodocs`

```text
You type /autodocs
      ↓
The AI reads the SKILL.md instructions
      ↓
The AI reads your code and notes where each fact came from
      ↓
The AI describes each diagram as a data file (.json)
      ↓
autodocs draws each diagram and checks it in a hidden Chrome window
      ↓
The AI writes the runbook and a short page for Confluence
      ↓
autodocs checks the runbook and builds the final files
      ↓
Everything is saved in docs/autodocs/ in your project
```

Step by step:

1. **You run a command.** The AI assistant finds the matching `SKILL.md` and
   follows it.
2. **The AI records which version of the code it is documenting.** It runs git
   commands to get the current commit and repository address. If the address
   contains a password or token, the instructions tell it to remove that.
3. **The AI studies the project.** It reads the README, settings, main program
   files and build files, and writes down the file and line number behind each
   fact.
4. **The AI plans the diagrams.** It usually makes one architecture diagram and
   two to four flow diagrams, and writes each as a `.json` file describing the
   boxes and arrows. It does not draw them.
5. **autodocs draws and checks each diagram.** Four automatic checks run: is the
   description valid, can it be drawn, do the source references match the code,
   and does it display properly in Chrome? If one fails, the AI fixes it and
   tries again.
6. **The AI writes two documents.** `runbook.md` is the full technical guide.
   `page.md` is the short plain-language page for Confluence.
7. **autodocs builds the final package** with the `bundle` step. It creates the
   draw.io and PNG copies of each diagram and checks the runbook. It confirms that
   the required sections exist, there is no placeholder text, links work, and each
   cited file and line exists. It then builds the `confluence/` folder.

The result is in `docs/autodocs/`. Nothing has left your computer through
autodocs at this point, except what the AI assistant sent to its own service.

## What happens when you upload to Confluence

`/autodocs-confluence-upload` does the steps above if needed, and then:

1. **Finds your login.** It checks environment variables, then macOS Keychain,
   then a private file. It only asks if it finds nothing.
2. **Finds the page.** It uses the page saved in `.confluence.json`, or asks
   whether to create a new page or use an existing one.
3. **Shows a preview** and waits for you to confirm. Nothing is sent until then.
4. **Uploads the files** to the page: pictures, draw.io files, interactive
   diagrams and the runbook.
5. **Writes the page content** inside its own marked section. Anything outside
   that section stays as it was.
6. **Saves the page ID** so the next upload updates the same page.

The upload code is in `skills/autodocs/docs/confluence-publish.mjs`.

## Where your data goes

| What | Where it goes | When |
|---|---|---|
| Source code the AI reads | The AI provider (GitHub Copilot or Anthropic) | Every run |
| Generated docs and diagrams | Your computer, in `docs/autodocs/` | Every run |
| Diagrams being checked | A hidden Chrome window on your computer | Every diagram |
| Page, runbook and diagrams | Your Confluence site | Only after you confirm an upload |
| Confluence token | Stored on your computer, and sent only to your Confluence site | Each upload |
| Update check | A plain request to a fixed web address, with no code or project details | At most about once a day, while drawing diagrams |
| Logo images | The website named for that logo | Only if a diagram asks for a logo from a web address |

The code contains no analytics or usage tracking, and no other outgoing
connections were found when reviewing it. The update check can be turned off by
setting `AUTODOCS_UPDATE_CHECK_DISABLED=1`.

## Is it safe?

**Yes, for normal use, with two conditions:** use an AI tool your organisation
has approved for your code, and review the docs before you publish them. It
should not be run blindly on code that has passwords or keys written into it.

### What is already protected

- The Confluence token is typed in hidden and is never printed, stored in the
  repository or placed on a command line.
- The token only goes to your own Confluence site, over HTTPS.
- Nothing is uploaded without a preview and your confirmation.
- Existing content on a Confluence page is kept unless you ask to replace it.
- autodocs never deletes pages or attachments from Confluence.

### The risks to know about

1. **Your code goes to the AI provider.** This is the biggest point, and it comes
   from using an AI assistant, not from autodocs itself. Whether that is acceptable
   depends on your plan and your company's rules.
2. **There is no automatic secret scanner.** If a password or key is written in
   your code, the AI could copy it into the docs, and from there into Confluence.
   autodocs does not block the AI from reading a `.env` file either. Search the
   docs for secrets before publishing.
3. **The docs reveal how your system works.** The runbook lists file names,
   service names, commands and setting names. Everyone who can see that Confluence
   space can read it, so choose the space carefully.
4. **The docs may be committed to git.** Check them before pushing to a public
   repository.
5. **The AI can run commands on your computer.** It asks first unless you have
   turned that off. Read what it asks to run.
6. **Text inside your code can influence the AI.** A malicious file could contain
   instructions aimed at the AI. This matters most for code from outside your
   organisation.
7. **The AI can be wrong.** The checks confirm that a cited file and line exist,
   not that they prove the claim. Someone who knows the system should review it.
8. **The token is as powerful as your account.** On macOS it is in Keychain. On
   other systems it is in a private file that is not encrypted. If it is exposed,
   revoke it in your Atlassian account.

## Questions people will ask

**Does autodocs send my code anywhere?**
autodocs itself doesn't. The AI assistant you run it in reads your code and sends
it to that assistant's service, as it does for any other task.

**Does it need Claude?**
No. It works with GitHub Copilot or Claude Code.

**Do I need to pay for autodocs?**
autodocs itself has no charge. You need your own Copilot or Claude plan.

**Is the documentation accurate?**
It is based on the code, and automatic checks catch missing sections, broken links
and citations to files or lines that don't exist. A person should still review it,
because the AI can misread code.

**Does it change my code?**
It adds files under `docs/autodocs/`. `/autodocs-readme` also changes one marked
section of your README and leaves the rest as it is.

**Does it work offline?**
No, because the AI assistant needs the internet.

**Where is my Confluence token kept?**
In macOS Keychain, or in a private file at `~/.config/autodocs/confluence.json` on
other systems. It is never put in the project.

## Where to look in the code

| To see | Open |
|---|---|
| The steps the AI follows | `skills/autodocs/SKILL.md` |
| The commands autodocs can run | `skills/autodocs/bin/autodocs.mjs` |
| Diagram drawing and checks | `skills/autodocs/bin/engine.mjs`, `bin/finalize.mjs` |
| Runbook checks | `skills/autodocs/docs/runbook-check.mjs` |
| Conversion to Confluence format | `skills/autodocs/docs/confluence.mjs` |
| Confluence upload and login | `skills/autodocs/docs/confluence-publish.mjs` |
| Update check | `skills/autodocs/scripts/check-update.mjs` |
