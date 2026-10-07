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

**Post links (0.2.9).** On a `list_group_posts` page the result also carries `items: [{ text, href }]`: one entry per top-level post (`[role="article"]` that is not nested in another), with the first 700 characters of its text and the permalink its timestamp links to (`/groups/<g>/posts/<id>/` or `/permalink/<id>/`), `null` when the page shows none. Items are merged across scrolls like the text. The server ties a request to its post by matching the excerpt against the item text, and falls back to a group search when no link was seen.

**Feeds (0.2.8).** `list_group_posts` reads a feed whose items are text, not links (a Facebook group, most recent posts first). A feed drops what scrolls out of view, so the visible text is kept line by line across five scrolls, each line once, in reading order, and returned as `text` (capped at 20,000 characters). The extension never joins, posts, comments or reacts.

**Popup (0.2.7).** The popup shows the role of this installation (Reader or Messenger), the pages read against each cap, and why it stopped: session cap (press Start again after a break) or daily cap (back tomorrow). The idle line is worded per role: a Messenger installation says how many reading tasks wait for the Reader profile.

**List pages (0.2.6).** Lists (`list_hashtag`, `list_ad_library`, `list_tiktok_ads`) load their next items only while the page is displayed: in a background tab the scroll moves and nothing new is rendered. The working tab and its window come to the front for the reading of a list, then the tab and the window the user was on are put back (option « List pages », on by default). The result carries `list: { steps, links, visibility }`: the number of links seen after each scroll and the visibility of the page, so that the server can tell a list that stayed on its first items.

**Contact address (0.2.5, off by default since 0.2.6).** On an Instagram `read_profile`, the result can carry `contact: { email, source, category, professional, note }`: the public contact address a professional account publishes (the « E-mail » button of the mobile app), read without any click from a visible `mailto` link or from the profile data the site loads for the page (one same-origin request). Instagram answered `429` to this request on the first real run: the option is off by default, and one refusal (401, 403, 429) stops it until the extension is restarted.

**Roles.** The options page sets the role of an installation: `reader` (default) asks `GET /ext/next` without a filter and the server never hands it a `prefill_message`; `messenger` asks `GET /ext/next?types=prefill_message` and only prepares messages. Install the extension in two Chrome profiles: a secondary account for reading, the account prospects should see for messages.

## Guardrails (in the extension, not configurable below their floors)

- Random pause between two pages: 5 to 10 s by default, never under 5 s.
- Caps: 60 pages per session and 150 per day by default (hard ceilings 100 and 300).
- Stops by itself on a login page, a captcha, a cookie-consent page or a restriction notice, and tells the user.
- Reads only: no like, follow, comment, message or form submit. The only scripts injected are `extract.js` (read), `scroll.js` (scroll down), the contact reading on Instagram profiles (one request for the profile data, off by default) and, in the messenger role, the paste function (opens the conversation, pastes, never sends).
- A dedicated tab the user can watch, in the background except while a list is read; Pause and Stop in the popup; a log of the last actions.

## Install (developer mode)

1. `chrome://extensions` → Developer mode → Load unpacked → this folder.
2. Options: server API URL (e.g. `https://api.example.com/api/browser-tasks`) and the token given by the admin screen. Test connection.
3. Use a **secondary** social account in this Chrome profile, never the brand's showcase account.
4. Create a batch of tasks on the server, then click Start.

## Files

`manifest.json` · `background.js` (loop and guardrails) · `extract.js` (page reader) · `scroll.js` · `popup.*` (Start / Pause / Stop, counters, log) ·
`options.*` (server, token, limits) · `_locales/`.
