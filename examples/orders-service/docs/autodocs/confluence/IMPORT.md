# Importing "orders-service runbook" into Confluence

Three steps: create the page, attach the files, place the diagrams. No API,
tokens or extra tools are needed; the API route at the end is optional.

| File | Use it for |
|---|---|
| `page.html` | Open in a browser and copy-paste into Confluence (easiest) |
| `page.md` | Paste as Markdown |
| `page.xhtml` | Confluence storage format, for a source editor app or the REST API |
| `attachments/` | Files to attach to the page: draw.io diagrams and interactive HTML diagrams |

## 1. Create the page

Create a new Confluence page titled **orders-service runbook**, then fill it with one of these:

**A. Copy and paste (recommended).** Open `page.html` in your browser, press
Cmd+A / Ctrl+A, copy, and paste into the empty page body. Headings, tables,
lists, links and code blocks keep their formatting; coloured callouts arrive as
plain text, which you can turn back into panels with `/info` or `/warning`.

**B. Paste Markdown.** Copy the contents of `page.md`. On Confluence Data
Center/Server, use *Insert → Markup → Markdown* and paste it. On Confluence
Cloud, paste it straight into the editor; it usually converts headings, lists,
tables and code as you paste. If it stays plain text, use option A.

**C. Storage format (exact panels, code macros and table of contents).** If
your site has a source editor app (for example *Confluence Source Editor*),
open it on the page and paste `page.xhtml`.

## 2. Attach the files

Edit the page and drag every file from `attachments/` onto it, or use
*••• → Attachments → Upload files*. Links in the page to these files start
working once they are attached.

## 3. Place the draw.io diagrams

Each "Diagram" panel names a `.drawio` file. Edit the page, click the panel,
choose *Insert → draw.io Diagram* (or type `/draw.io`), then *Import* (or
*File → Import from → Device* inside the draw.io editor) and select the file
from `attachments/`. Delete the panel afterwards. The diagram stays editable in
Confluence. This needs the *draw.io Diagrams for Confluence* app on your site;
without it, attach a PNG exported from the interactive `.html` diagram instead.

Readers can download the attached `.html` diagrams and open them in a browser
for focus, path tracing and image export.

## Optional: automate with the REST API

For scripted or CI publishing, create the page from `page.xhtml` and upload
the attachments:

```bash
curl -u "$CONFLUENCE_USER:$CONFLUENCE_API_TOKEN" -H 'Content-Type: application/json' \
  -X POST "$CONFLUENCE_BASE_URL/wiki/rest/api/content" \
  -d "$(jq -n --arg t 'orders-service runbook' --arg s "$CONFLUENCE_SPACE" --rawfile b page.xhtml \
    '{type:"page",title:$t,space:{key:$s},body:{storage:{value:$b,representation:"storage"}}}')"

for f in attachments/*; do
  curl -u "$CONFLUENCE_USER:$CONFLUENCE_API_TOKEN" -H 'X-Atlassian-Token: no-check' \
    -X POST "$CONFLUENCE_BASE_URL/wiki/rest/api/content/$PAGE_ID/child/attachment" -F "file=@$f"
done
```

## Files

- `attachments/architecture.drawio`
- `attachments/architecture.html`
- `attachments/order-payment-flow.drawio`
- `attachments/order-payment-flow.html`
