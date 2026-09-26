# Prospecting Assistant · Chrome extension

A Manifest V3 extension that executes a **task queue** from a server in the user's own browser session: it opens the page
a task asks for in a background tab, waits, extracts the visible text and links, and sends that reduced page back.
Everything that turns pages into prospects happens server side. The extension has no knowledge of the product it serves.

## Protocol (server side to implement)

Header on every call: `X-Extension-Token: <token>`.

| Call | Purpose | Answer |
|---|---|---|
| `GET {serverUrl}/ext/status` | connection test (the options page also requests host permission for the server origin; if refused, the server must accept the `chrome-extension://` origin on these routes) | `{ ok, pending, running }` |
| `GET {serverUrl}/ext/next` | claim the next task | `{ task: { id, type, input: { url, query, count } } \| null, pending, running }` |
| `POST {serverUrl}/ext/{id}/result` | send the page | body `{ url, finalUrl, title, text, links: [{ href, text }], blocked: null \| 'login' \| 'captcha' \| 'restricted' \| 'consent' \| 'error', error? }` → `{ outcome, blocked }` |

Task types the extension knows: `read_post_author`, `read_profile` (one page, no scroll), `list_hashtag` (4 scrolls),
`list_ad_library` (6 scrolls), `list_tiktok_ads` (6 scrolls), `read_post_brands` (one page), and `prefill_message` (opens the profile in a visible tab, opens the conversation, pastes `input.text`, stops; result `{ prefilled, copied, error }`). Any other type is read as a single page.

**Roles.** The options page sets the role of an installation: `reader` (default) asks `GET /ext/next` without a filter and the server never hands it a `prefill_message`; `messenger` asks `GET /ext/next?types=prefill_message` and only prepares messages. Install the extension in two Chrome profiles: a secondary account for reading, the account prospects should see for messages.

## Guardrails (in the extension, not configurable below their floors)

- Random pause between two pages: 5 to 10 s by default, never under 5 s.
- Caps: 60 pages per session and 150 per day by default (hard ceilings 100 and 300).
- Stops by itself on a login page, a captcha, a cookie-consent page or a restriction notice, and tells the user.
- Reads only: no like, follow, comment, message or form submit. The only scripts injected are `extract.js` (read), `scroll.js` (scroll down) and, in the messenger role, the paste function (opens the conversation, pastes, never sends).
- A dedicated background tab the user can watch; Pause and Stop in the popup; a log of the last actions.

## Install (developer mode)

1. `chrome://extensions` → Developer mode → Load unpacked → this folder.
2. Options: server API URL (e.g. `https://api.example.com/api/browser-tasks`) and the token given by the admin screen. Test connection.
3. Use a **secondary** social account in this Chrome profile, never the brand's showcase account.
4. Create a batch of tasks on the server, then click Start.

## Files

`manifest.json` · `background.js` (loop and guardrails) · `extract.js` (page reader) · `scroll.js` · `popup.*` (Start / Pause / Stop, counters, log) ·
`options.*` (server, token, limits) · `_locales/`.
