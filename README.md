# autodocs

autodocs reads your code and writes the documentation for you: architecture
diagrams, a runbook, a README section and a Confluence page. It runs inside
[Claude Code](https://code.claude.com/docs), in the terminal or in IntelliJ.

**New here?** Follow the four steps below, in order. It takes about 15 minutes.

1. [Install what you need](#step-1-install-what-you-need)
2. [Install Claude Code](#step-2-install-claude-code)
3. [Add autodocs to Claude Code](#step-3-add-autodocs-to-claude-code)
4. [Create your first docs](#step-4-create-your-first-docs)

Using IntelliJ? Do steps 1 to 3, then [set up IntelliJ](#using-autodocs-in-intellij).

## What you get

| You type | You get |
|---|---|
| `/autodocs` | Everything below |
| `/autodocs-runbook` | A guide to installing, running and fixing your project |
| `/autodocs-readme` | A better `README.md`. Anything you wrote yourself is kept |
| `/autodocs-confluence` | Files you can copy into Confluence by hand |
| `/autodocs-confluence-upload` | Your docs published straight to Confluence Cloud |

Diagrams come as an interactive web page, an editable draw.io file and a PNG
picture. To see real output, look at the
[example project](examples/orders-service/docs/autodocs/).

## Step 1: Install what you need

Open a terminal and run the three checks. If a command prints a version number,
that tool is already installed.

| Tool | Why autodocs needs it | Check | Install |
|---|---|---|---|
| **Node.js 18 or newer** | Runs autodocs | `node --version` | [Download the LTS version](https://nodejs.org/en/download) |
| **Git** | Downloads autodocs | `git --version` | [Download Git](https://git-scm.com/downloads) |
| **Chrome, Edge or Chromium** | Checks diagrams and creates the pictures | Open the browser | [Download Chrome](https://www.google.com/chrome/) |

If you already use a package manager, these commands do the same job:

```bash
# macOS (with Homebrew)
brew install node git
brew install --cask google-chrome

# Windows (in PowerShell)
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Google.Chrome
```

Close and reopen your terminal after installing, then run the checks again.

You also need a paid Claude plan (Pro, Max, Team or Enterprise) or a Claude
Console account. The free plan does not include Claude Code.

## Step 2: Install Claude Code

Run the command for your system:

```bash
# macOS, Linux or WSL
curl -fsSL https://claude.ai/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://claude.ai/install.ps1 | iex
```

Open a **new** terminal and check that it worked:

```bash
claude --version
```

It should print a version number. Then type `claude` and follow the browser
prompts to log in. When you're done, type `/exit` to return to the terminal.

## Step 3: Add autodocs to Claude Code

Run these two commands in your terminal:

```bash
claude plugin marketplace add shivatarunkumar/-auto-docs
claude plugin install autodocs@autodocs
```

To check that it worked, start `claude` and type `/autodocs`. You should see the
autodocs commands in the list.

> [!NOTE]
> Commands installed this way may have the longer name
> `/autodocs:autodocs-runbook`. Both forms do the same thing. The easiest way is
> to type `/autodocs` and choose from the list.

## Step 4: Create your first docs

1. In your terminal, go to the project you want to document, and start Claude
   Code:

   ```bash
   cd path/to/your/project
   claude
   ```

2. Type a command and press Enter:

   ```text
   /autodocs
   ```

3. Claude Code asks before it runs commands. Allow them, because autodocs needs
   them to create and check the docs. A full run can take several minutes.

4. Open the results in the `docs/autodocs/` folder of your project:

   | Open this | To see |
   |---|---|
   | `runbook.md` | The full guide to your project |
   | `diagrams/architecture.html` | The interactive diagram, in your browser |
   | `diagrams/architecture.drawio` | The diagram, ready to edit in draw.io |
   | `diagrams/architecture.png` | The diagram as a picture |

You can add plain instructions after any command:

```text
/autodocs architecture
/autodocs flows the checkout and refund flows
/autodocs-runbook for on-call engineers
/autodocs-readme emphasise local development
```

Keep the `.json` files in `diagrams/`. They are the source of each diagram, and
autodocs uses them when it updates the docs.

## Using autodocs in IntelliJ

IntelliJ uses the same Claude Code you installed in steps 2 and 3, so finish
those first. The same steps work in PyCharm, WebStorm and other JetBrains IDEs.

1. In IntelliJ, open **Settings → Plugins → Marketplace**.
2. Search for **Claude Code** and install
   [the plugin](https://plugins.jetbrains.com/plugin/27310-claude-code-beta-).
3. Restart IntelliJ.
4. Open your project, then open the **Terminal** panel at the bottom of the
   window.
5. Type `claude` and press Enter. You can also press `Cmd+Esc` on Mac or
   `Ctrl+Esc` on Windows and Linux.
6. Type `/autodocs` and choose a command, as in [step 4](#step-4-create-your-first-docs).

If you see "Cannot launch Claude Code", IntelliJ can't find `claude`. Run
`claude --version` in a terminal to confirm it's installed, then restart
IntelliJ. If that doesn't help, enter the full path under
**Settings → Tools → Claude Code [Beta] → Claude command**.

> [!NOTE]
> In IntelliJ, use the Claude Code plugin. autodocs hasn't been confirmed to work
> with the GitHub Copilot plugin for IntelliJ.

## Publish to Confluence

### Upload automatically (Confluence Cloud)

In your project, run:

```text
/autodocs-confluence-upload
```

**The first time,** autodocs needs your login details:

1. Create an API token at
   [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
   Choose **Create API token**, not the option with scopes.
2. autodocs asks for your site address and email, such as
   `https://your-company.atlassian.net`, and gives you one command to run in a
   terminal.
3. Run that command and paste your token when asked. Nothing appears as you
   paste, which is normal. Never paste your token into the chat.

autodocs saves the token securely and won't ask again on that computer.

**Then** it asks whether to create a new page or use an existing one, shows you
a preview, and publishes when you confirm. Later runs update the same page.

What ends up on the page:

- A short summary that anyone can understand.
- Your diagrams as pictures.
- A Files table with the editable draw.io files, interactive diagrams and full
  technical runbook.

autodocs only changes its own section, so anything you add above or below it is
kept.

> [!NOTE]
> Diagrams appear as pictures. To make one editable on the page, your site needs
> the *draw.io Diagrams* app. Then use **Insert → draw.io Diagram → Import** and
> pick the attached `.drawio` file.

### Copy it in by hand (Cloud or Data Center)

Run `/autodocs-confluence`, then follow the steps in
`docs/autodocs/confluence/IMPORT.md`. No token is needed.

## Keep autodocs up to date

```bash
claude plugin marketplace update autodocs
claude plugin update autodocs@autodocs
```

Restart Claude Code afterwards. To remove autodocs, run
`claude plugin uninstall autodocs@autodocs`.

## If something goes wrong

| What you see | What to do |
|---|---|
| `claude: command not found` | Open a new terminal. If it still fails, see [Claude Code install help](https://code.claude.com/docs/en/troubleshoot-install.md) |
| `node: command not found` | Install Node.js from step 1, then open a new terminal |
| `/autodocs` isn't in the list | Restart Claude Code, then run `claude plugin list` to check that autodocs is installed |
| A warning that PNG export was skipped | Install Chrome from step 1 and run the command again |
| Confluence says login failed | Create a new token and log in again. Only Confluence Cloud works with automatic upload |
| Confluence says the page title already exists | Choose to publish into that page, or give the new page another name |

Not sure what's wrong? Ask Claude Code to "run the autodocs doctor command and
explain the result".

## Other ways to install

<details>
<summary>Install without the plugin system</summary>

This copies the commands into `~/.claude/skills/`, so they use the short names.

```bash
git clone https://github.com/shivatarunkumar/-auto-docs.git autodocs
node autodocs/install.mjs --agent claude
```

To update, run `git pull` in the `autodocs` folder and repeat the install command
with `--force`. To remove, repeat it with `--uninstall`.
</details>

<details>
<summary>GitHub Copilot in VS Code</summary>

1. Install the commands, either for yourself or for one project:

   ```bash
   git clone https://github.com/shivatarunkumar/-auto-docs.git autodocs

   # For you, in every project (~/.copilot/skills/)
   node autodocs/install.mjs --agent copilot

   # Or for one project, shared with your team (<project>/.github/skills/)
   node autodocs/install.mjs --agent copilot --project ~/my-app
   ```

   For a project install, commit the new `.github/skills/autodocs*` folders.

2. In VS Code, open the Command Palette and run *Developer: Reload Window*.
3. Open Copilot Chat in **Agent** mode, type `/` and pick a command.

To update, run `git pull` in the clone and repeat the install command with
`--force`. To remove, repeat it with `--uninstall`. If the commands don't appear,
type `/skills` in the chat to see what Copilot has loaded.

You can also install it as a VS Code agent plugin. Turn on the
`chat.plugins.enabled` setting, run *Chat: Install Plugin from Source*, and enter
`https://github.com/shivatarunkumar/-auto-docs`.
</details>

<details>
<summary>GitHub Copilot CLI</summary>

```bash
copilot plugin install shivatarunkumar/-auto-docs   # install
copilot plugin update autodocs                      # update
copilot plugin uninstall autodocs                   # remove
```
</details>

## For contributors

<details>
<summary>Command-line reference</summary>

Claude Code runs these for you. They also work by hand from a clone of this
repository:

```bash
A=skills/autodocs/bin/autodocs.mjs
node $A doctor                                                   # check the setup
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

For CI, set `CONFLUENCE_BASE_URL`, `CONFLUENCE_USER` and `CONFLUENCE_API_TOKEN`.
They take priority over saved credentials.
</details>

<details>
<summary>What's in docs/autodocs/</summary>

```text
docs/autodocs/
  runbook.md            full technical guide
  page.md               short plain-language page for Confluence
  diagrams/<name>.json | .html | .drawio | .png
  confluence/page.html  page.md  page.xhtml  attachments/  IMPORT.md
  .confluence.json      the page uploads go to; no secrets, safe to commit
  .checks/              generation check results (git-ignored)
```
</details>

<details>
<summary>Repository layout</summary>

| Path | Purpose |
|---|---|
| `skills/autodocs/SKILL.md` | `/autodocs`: full documentation run |
| `skills/autodocs-runbook/`, `autodocs-confluence/`, `autodocs-confluence-upload/`, `autodocs-readme/` | The focused commands; they use the engine in `skills/autodocs` |
| `skills/autodocs/references/` | Runbook, README, Confluence page and diagram authoring rules |
| `skills/autodocs/bin/autodocs.mjs` | CLI: `drawio`, `png`, `runbook`, `readme`, `confluence`, `bundle`, plus the engine |
| `skills/autodocs/drawio/` | Rendered diagram → draw.io converter |
| `skills/autodocs/docs/` | Runbook/README checks, PNG export, Markdown → Confluence, Confluence upload |
| `skills/autodocs/renderers/`, `schemas/`, `bin/engine.mjs` | Diagram engine: rendering and validation |
| `.claude-plugin/` | Claude Code plugin and marketplace manifests |
| `install.mjs` | Installer for GitHub Copilot and Claude Code |
| `tests/` | `npm test` |
</details>

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
