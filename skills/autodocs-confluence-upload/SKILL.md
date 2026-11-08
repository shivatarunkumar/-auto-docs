---
name: autodocs-confluence-upload
description: "Publish a codebase's autodocs documentation directly to Confluence Cloud: creates a page or updates an existing one, shows architecture and flow diagrams as images, and attaches the editable draw.io files. Saves the API token once and reuses it. Use when the user runs /autodocs-confluence-upload or asks to upload, publish or push docs or diagrams to Confluence. To only prepare files for manual import, use autodocs-confluence."
argument-hint: "[repo path] [Confluence page URL or space key]"
license: Apache-2.0
metadata:
  version: "0.3.0"
---

# autodocs-confluence-upload

Publish `<docs>/confluence/` to Confluence Cloud. Confluence Data Center and
Server are not supported; point those users to `/autodocs-confluence`.

`<engine>` is the `autodocs` skill folder next to this one (`../autodocs`
relative to this file); resolve it to an absolute path. `AD` below means
`node <engine>/bin/autodocs.mjs`. Run commands from the target repository root.
`<docs>` is `docs/autodocs/` unless the user names another folder.

## 1. Make sure the bundle is current

Follow *Decide what to generate*, *Write the page people will read* and
*Bundle* in `../autodocs-confluence/SKILL.md`. Do not continue until `bundle`
exits 0.

## 2. Credentials: ask only when they are missing

```bash
AD confluence status --json
```

- **`configured` is true:** use the saved credentials. Do not mention or ask
  for a token.
- **`configured` is false:** ask for the Confluence site URL and email, then give
  the user this command to run in their own terminal and wait until they say it
  is done:

  ```bash
  AD confluence login --base-url https://<site>.atlassian.net --email <email>
  ```

  It asks for the token with hidden input, verifies it and saves it (macOS
  Keychain, otherwise a private file in `~/.config/autodocs/`). They can create
  a token at <https://id.atlassian.com/manage-profile/security/api-tokens>; it
  must be a classic token, without scopes.

Never ask the user to paste a token into the chat, and never put one in a
command, file or reply. If they paste one anyway, do not repeat or use it, and
tell them to revoke it and use the command above.

## 3. Choose the page

If `<docs>/.confluence.json` exists, keep publishing to that page and name it
in the confirmation; do not ask again unless the user wants a different page.

Otherwise ask one question: **create a new page, or load the content into an
existing page?**

- **New:** get the space key, and optionally a parent page. Use
  `--new --space <KEY> [--parent <url>]`.
- **Existing:** get the page's full URL. Use `--page <url>`.

If the user already gave a page URL or space key, do not ask.

## 4. Preview, confirm, publish

```bash
AD confluence publish <docs> <target flags> --repo-root . --dry-run
```

Show the page, its effect and any warnings, then get the user's confirmation.
Publishing is visible to everyone who can see that space. After they confirm,
run the same command with `--yes` in place of `--dry-run`.

By default autodocs owns only a marked block on the page, and content outside
that block is kept. Use `--mode replace` only when the user explicitly asks to
overwrite the whole page, and say so in the confirmation.

## Failures

The exit code and, with `--json`, the `code` field say what to do. A non-zero
exit is never success.

| Exit / code | Do this |
|---|---|
| `3` `credentials-missing` | Go to step 2 |
| `3` `target-required` | Go to step 3 |
| `4` `auth` | The saved token was rejected. Have the user run `login` again |
| `title-exists` | Offer to publish into that page, or to use `--title` |
| `markers-missing`, `markers-damaged` | Explain that the managed block was removed or broken; use `--mode replace` only if the user agrees |

## Reply

Link the published page. Say that every diagram's `.drawio`, `.html` and `.png`
are attached and listed in the page's Files table. To make a diagram live and
editable on the page, use *Insert → draw.io Diagram → Import* with the attached
file; that needs the draw.io app on the site. Repeat any warnings from the
publish.
