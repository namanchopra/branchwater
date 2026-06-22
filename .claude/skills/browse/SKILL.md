---
name: browse
version: 1.0.0
description: |
  Fast web browsing for Claude Code via persistent headless Chromium daemon. Navigate to any URL,
  read page content, click elements, fill forms, run JavaScript, take screenshots,
  inspect CSS/DOM, capture console/network logs, and more. ~100ms per command after
  first call. Use when you need to check a website, verify a deployment, read docs,
  or interact with any web page. No MCP, no Chrome extension — just fast CLI.
allowed-tools:
  - Bash
  - Read

---

# browse: Persistent Browser for Claude Code

Persistent headless Chromium daemon. First call auto-starts the server (~3s).
Every subsequent call: ~100-200ms. Auto-shuts down after 30 min idle.

## SETUP (run this check BEFORE any browse command)

```bash
# Check if browse is on PATH (installed globally by setup script)
if command -v browse &>/dev/null; then
  echo "READY"
else
  echo "NEEDS_SETUP"
fi
```

If `NEEDS_SETUP`, find the source and build it. Check these locations in order:

```bash
if test -x src/browse/setup; then
  SETUP=src/browse/setup
elif test -L .claude && test -x "$(dirname "$(readlink .claude)")/../src/browse/setup"; then
  SETUP="$(dirname "$(readlink .claude)")/../src/browse/setup"
elif test -x ~/.dotAiAgent/src/browse/setup; then
  SETUP=~/.dotAiAgent/src/browse/setup
fi
```

If a `SETUP` path was found:
1. Tell the user: "browse skill needs a one-time build (~10 seconds). OK to proceed?" Then STOP and wait for their response.
2. If they approve, run the setup script. It builds the binary AND symlinks it to `~/.local/bin/browse`.
3. If `bun` is not installed, tell the user to install it: `curl -fsSL https://bun.sh/install | bash`

If no setup script was found:
1. Tell the user: "browse binary not found. To build it:"
2. `git clone https://github.com/CiprianSpiridon/dotAiAgent.git /tmp/dotAiAgent && cd /tmp/dotAiAgent/src/browse && ./setup`

Once setup is done, it never needs to run again (the compiled binary persists).

### Permissions check

After confirming the binary is ready, check if browse commands are pre-allowed:

```bash
# Read the project settings file
cat .claude/settings.json 2>/dev/null
```

If the file is missing or does not contain browse permission rules in `permissions.allow`:
1. Tell the user: "browse works best when its commands are pre-allowed so you don't get prompted on every call. Add browse permissions to `.claude/settings.json`?"
2. If they approve, read the existing `.claude/settings.json` (or create it), and add ALL of these rules to `permissions.allow` (merge with existing rules — do not overwrite):

```json
"Bash(browse:*)",
"Bash(browse goto:*)", "Bash(browse back:*)", "Bash(browse forward:*)",
"Bash(browse reload:*)", "Bash(browse url:*)", "Bash(browse text:*)",
"Bash(browse html:*)", "Bash(browse links:*)", "Bash(browse forms:*)",
"Bash(browse accessibility:*)", "Bash(browse snapshot:*)",
"Bash(browse snapshot-diff:*)", "Bash(browse click:*)",
"Bash(browse fill:*)", "Bash(browse select:*)", "Bash(browse hover:*)",
"Bash(browse type:*)", "Bash(browse press:*)", "Bash(browse scroll:*)",
"Bash(browse wait:*)", "Bash(browse viewport:*)", "Bash(browse upload:*)",
"Bash(browse dialog-accept:*)", "Bash(browse dialog-dismiss:*)",
"Bash(browse js:*)", "Bash(browse eval:*)", "Bash(browse css:*)",
"Bash(browse attrs:*)", "Bash(browse state:*)", "Bash(browse dialog:*)",
"Bash(browse console:*)", "Bash(browse network:*)",
"Bash(browse cookies:*)", "Bash(browse storage:*)", "Bash(browse perf:*)",
"Bash(browse devices:*)", "Bash(browse emulate:*)",
"Bash(browse screenshot:*)", "Bash(browse pdf:*)",
"Bash(browse responsive:*)", "Bash(browse diff:*)",
"Bash(browse chain:*)", "Bash(browse tabs:*)", "Bash(browse tab:*)",
"Bash(browse newtab:*)", "Bash(browse closetab:*)",
"Bash(browse status:*)", "Bash(browse stop:*)", "Bash(browse restart:*)",
"Bash(browse cookie:*)", "Bash(browse header:*)",
"Bash(browse useragent:*)"
```

Note: The catch-all `Bash(browse:*)` should cover everything, but explicit per-subcommand rules are more reliable across Claude Code versions.

## IMPORTANT

- Always call `browse` as a bare command (it's on PATH via `~/.local/bin/browse`).
- Do NOT use shell variables like `B=...` or full paths — they break Claude Code's permission matching.
- NEVER use `#` in CSS selectors — use `[id=foo]` instead of `#foo`. The `#` character breaks Claude Code's permission matching and triggers approval prompts.
- NEVER use `mcp__claude-in-chrome__*` tools. They are slow and unreliable.
- The browser persists between calls — cookies, tabs, and state carry over.
- The server auto-starts on first command. No setup needed.

## Quick Reference

In these examples, replace the path with whichever `READY` path was found in SETUP above.
Each command is a **separate Bash call** using the full binary path — never a shell variable.

```bash
# Navigate to a page
browsegoto https://example.com

# Read cleaned page text
browsetext

# Take a screenshot (then Read the image)
browsescreenshot .browse/page.png

# Snapshot: accessibility tree with refs
browsesnapshot -i

# Click by ref (after snapshot)
browseclick @e3

# Fill by ref
browsefill @e4 "test@test.com"

# Run JavaScript
browsejs "document.title"

# Get all links
browselinks

# Click by CSS selector
browseclick "button.submit"

# Fill a form by CSS selector (use [id=...] instead of # to avoid shell issues)
browsefill "[id=email]" "test@test.com"
browsefill "[id=password]" "abc123"
browseclick "button[type=submit]"

# Get HTML of an element
browsehtml "main"

# Get computed CSS
browsecss "body" "font-family"

# Get element attributes
browseattrs "nav"

# Wait for element to appear
browsewait ".loaded"

# Accessibility tree
browseaccessibility

# Set viewport
browseviewport 375x812

# Set cookies / headers
browsecookie "session=abc123"
browseheader "Authorization:Bearer token123"
```

## Command Reference

### Navigation
```
browse goto <url>         Navigate current tab
browse back               Go back
browse forward            Go forward
browse reload             Reload page
browse url                Print current URL
```

### Content extraction
```
browse text               Cleaned page text (no scripts/styles)
browse html [selector]    innerHTML of element, or full page HTML
browse links              All links as "text → href"
browse forms              All forms + fields as JSON
browse accessibility      Accessibility tree snapshot (ARIA)
```

### Snapshot (ref-based element selection)
```
browse snapshot           Full accessibility tree with @refs
browse snapshot -i        Interactive elements only (buttons, links, inputs)
browse snapshot -c        Compact (no empty structural elements)
browse snapshot -C        Cursor-interactive (detect divs with cursor:pointer/onclick/tabindex)
browse snapshot -d <N>    Limit depth to N levels
browse snapshot -s <sel>  Scope to CSS selector
browse snapshot-diff      Compare current vs previous snapshot (shows added/removed elements)
```

After snapshot, use @refs as selectors in any command:
```
browse click @e3          Click the element assigned ref @e3
browse fill @e4 "value"   Fill the input assigned ref @e4
browse hover @e1          Hover the element assigned ref @e1
browse html @e2           Get innerHTML of ref @e2
browse css @e5 "color"    Get computed CSS of ref @e5
browse attrs @e6          Get attributes of ref @e6
```

Refs are invalidated on navigation — run `snapshot` again after `goto`.

### Interaction
```
browse click <selector>        Click element (CSS selector or @ref)
browse fill <selector> <value> Fill input field
browse select <selector> <val> Select dropdown value
browse hover <selector>        Hover over element
browse type <text>             Type into focused element
browse press <key>             Press key (Enter, Tab, Escape, etc.)
browse scroll [selector]       Scroll element into view, or page bottom
browse wait <selector>         Wait for element to appear (max 10s)
browse viewport <WxH>          Set viewport size (e.g. 375x812)
browse upload <sel> <files>    Upload file(s) to a file input
browse dialog-accept           Set dialogs to auto-accept (prevents lockup)
browse dialog-dismiss          Set dialogs to auto-dismiss (default)
```

### Inspection
```
browse js <expression>         Run JS, print result
browse eval <js-file>          Run JS file against page
browse css <selector> <prop>   Get computed CSS property
browse attrs <selector>        Get element attributes as JSON
browse console                 Dump captured console messages
browse console --clear         Clear console buffer
browse network                 Dump captured network requests
browse network --clear         Clear network buffer
browse cookies                 Dump all cookies as JSON
browse storage                 localStorage + sessionStorage as JSON
browse storage set <key> <val> Set localStorage value
browse perf                    Page load performance timings
browse state <selector>        Element state (visible/enabled/checked/focused + bounding box)
browse dialog                  Last dialog info (type, message) or "(no dialog detected)"
```

### Visual
```
browse screenshot [path]              Screenshot (default: .browse/browse-screenshot.png)
browse screenshot --annotate [path]   Screenshot with numbered badges on elements + legend
browse pdf [path]                     Save as PDF
browse responsive [prefix]            Screenshots at mobile/tablet/desktop
```

### Compare
```
browse diff <url1> <url2>      Text diff between two pages
```

### Multi-step (chain)
```
echo '[["goto","https://example.com"],["snapshot","-i"],["click","@e1"],["screenshot",".browse/result.png"]]' | browse chain
```

### Tabs
```
browse tabs                    List tabs (id, url, title)
browse tab <id>                Switch to tab
browse newtab [url]            Open new tab
browse closetab [id]           Close tab
```

### Server management
```
browse status                  Server health, uptime, tab count
browse stop                    Shutdown server
browse restart                 Kill + restart server
```

## Speed Rules

1. **Navigate once, query many times.** `goto` loads the page; then `text`, `js`, `css`, `screenshot` all run against the loaded page instantly.
2. **Use `snapshot -i` for interaction.** Get refs for all interactive elements, then click/fill by ref. No need to guess CSS selectors.
3. **Use `js` for precision.** `js "document.querySelector('.price').textContent"` is faster than parsing full page text.
4. **Use `links` to survey.** Faster than `text` when you just need navigation structure.
5. **Use `chain` for multi-step flows.** Avoids CLI overhead per step.
6. **Use `responsive` for layout checks.** One command = 3 viewport screenshots.

## When to Use What

| Task | Commands |
|------|----------|
| Read a page | `goto <url>` then `text` |
| Interact with elements | `snapshot -i` then `click @e3` |
| Check if element exists | `js "!!document.querySelector('.thing')"` |
| Extract specific data | `js "document.querySelector('.price').textContent"` |
| Visual check | `screenshot .browse/x.png` then Read the image |
| Fill and submit form | `snapshot -i` → `fill @e4 "val"` → `click @e5` → `screenshot` |
| Check CSS | `css "selector" "property"` or `css @e3 "property"` |
| Inspect DOM | `html "selector"` or `attrs @e3` |
| Debug console errors | `console` |
| Check network requests | `network` |
| Check local dev | `goto http://127.0.0.1:3000` |
| Compare two pages | `diff <url1> <url2>` |
| Mobile layout check | `responsive .browse/prefix` |
| Multi-step flow | `echo '[...]' \| browse chain` |

## Architecture

- Persistent Chromium daemon on localhost (port 9999-10008)
- Bearer token auth per session
- Project-local state: `.browse/` directory at project root (auto-created, self-gitignored)
  - `browse-server.json` — server PID, port, auth token
  - `browse-console.log` — captured console messages
  - `browse-network.log` — captured network requests
  - `browse-screenshot.png` — default screenshot location
- Auto-shutdown after 30 min idle
- Chromium crash → server exits → auto-restarts on next command
