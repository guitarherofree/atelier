# Atelier

A private Mac app for an artist career: find residencies and grants, judge how well each one fits you, and prepare, review and track your applications. Everything you enter stays on your Mac.

---

## Install

1. Download `Atelier-<version>-mac-arm64.zip` from the [latest release](https://github.com/guitarherofree/atelier/releases/latest). The repository is private, so sign in to GitHub first.
2. Double-click the zip, then drag **Atelier** into **Applications**.
3. Open Atelier. The app is self-signed rather than notarized by Apple, so the first time macOS says it can’t verify the developer:
   - Open **System Settings › Privacy & Security**, scroll to *“Atelier” was blocked…*, and click **Open Anyway**.
   - You only do this once. Updates installed from inside Atelier don’t ask again.

Requires an Apple silicon Mac running macOS 12 or later.

## First run

1. **Artist Profile.** Add your disciplines, themes, goals, where you live and your citizenship, and your preferences (funding, fees, formats, regions, length of stay, dates you’re away, things you need). This is what Atelier compares each opportunity against. Add your **recommenders** here too.
2. **Portfolio.** Drop images, video, audio or PDFs onto the Portfolio page. Add captions, years, media and projects.
3. **Proposals & Text.** Start a proposal with **New proposal (guided)**, and save bios and statements you reuse.
4. **Find new.** Click **Find new opportunities** (⌘R). Atelier reads your sources and puts what it finds in **Discover**.
5. **Updates.** In **Settings › Updates**, paste a GitHub token so Atelier can see new releases. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with *Repository access › Only select repositories › guitarherofree/atelier* and *Permissions › Contents › Read-only*. If you already have a token for Oeuvre, you can edit it to add the atelier repository and paste the same token. It’s stored in your macOS Keychain.

## Using Atelier

| Area | What it does |
| --- | --- |
| **Discover** | New opportunities from your sources, sorted by fit. **Save** the promising ones, **Dismiss** the rest. Add more with **Add from URL** (⌘N), **Add by hand** (⇧⌘N), **Search the web** (⇧⌘F) or the **Atelier browser**. |
| **Opportunities** | Everything you saved. Each one shows every detail with where it came from, when it was last checked, and whether you should verify it. |
| **Applications** | A board by stage (drag cards between columns). Each application has a checklist of materials, a tailored proposal, answers with word/character limits, work samples, recommendation letters, notes, and a final **Review & submit** step. |
| **Calendar** | Deadlines, calls opening, residency dates, your own target dates and letter due dates. Choose which opportunities appear, and **Export to Apple Calendar**. |
| **Map** | In-person and hybrid residencies on a map. Online opportunities are listed separately. |
| **Portfolio** | Work samples with captions, project details, files and links. |
| **Proposals & Text** | Reusable proposals (with versions) and saved text. Tailored copies for each opportunity sit under their original, which never changes. |
| **Artist Profile** | Who you are, what you want, and what matters most when judging fit. |
| **Sources** | The sites Atelier reads. Edit, test, turn off or add your own. |
| **Settings** | Background checks, AI, search, Instagram, map, calendar, updates, backups and privacy. |

### Sources

Atelier starts with ArtConnect, Res Artis, Art Infoland, Artist Communities Alliance (formerly the Alliance of Artists Communities), Rivet, TransArtists, Artenda, Piney Wood Atlas, and an optional Instagram `#artistresidency` source.

- A source is one or more listing pages (or RSS/Atom feeds). Atelier finds the opportunity links on them, opens each new one, and reads its details. It waits between requests to the same site and only reads what you could see in a browser.
- **Test** a source to see which links it finds and what it reads from the first one. If a site changes and the link pattern stops working, Atelier learns a new one and offers to keep it.
- **Sign In** opens the source in the Atelier browser. Sign in once (for example to an Art Infoland membership) and Atelier uses that sign-in when it reads the source.
- Some sites draw their pages with JavaScript or refuse automated access. Atelier loads those like a browser when it needs to. When a site still refuses, the opportunity is kept with whatever the listing showed, marked **Couldn’t check**, with a button to open it in the Atelier browser and **Capture** it.
- **Piney Wood Atlas** is a guide to small residencies rather than a list of open calls, so its entries arrive without deadlines.
- **Instagram** only allows hashtag search through Meta’s Graph API for approved apps. In **Settings › Instagram** choose *Browse and capture* (sign in to Instagram in the Atelier browser, open posts, click **Capture**) or *Graph API* (needs a Meta app approved for Instagram Public Content Access, an Instagram professional account ID and a token).

### How Atelier shows what to trust

Every detail of an opportunity (name, location, discipline, eligibility, opening date, deadline, application fee, program fee, funding and restrictions, work samples, recommendation letters, other requirements, links and more) carries its own status:

| Status | Meaning |
| --- | --- |
| **Extracted — verify** | Read from the page automatically; check it against the official page. Important details (deadline, eligibility, fee, funding, location) are always flagged until you confirm them. |
| **Uncertain — verify** | Atelier found it, but the wording was ambiguous. |
| **From the listing** | Only the source’s listing showed this; the page itself couldn’t be read. |
| **Extracted by AI — verify** | Read by the optional AI, with the quote it relied on. |
| **Confirmed by you** | You checked it (✓). |
| **Entered by you** | You typed it. Re-checks never overwrite it. |
| **Changed on site** | A re-check found a different value. The old one is shown, with **Undo**. |
| **Site now differs** | Your value differs from what the page now says. Choose **Use site’s value** or **Keep mine**. |
| **No longer on site** | The detail disappeared from the page. |
| **Not rechecked lately** | Not checked for longer than you allow in Settings (14 days by default). |

Click a status to see the source page, when it was found and last checked, how confident Atelier is, and the exact text it came from. **Page history** shows what changed on the page between checks.

Saved opportunities are re-checked every 3 days (Settings › General). If a deadline, fee, eligibility, funding or location changes on something you saved, Atelier notifies you. If a site is offline or blocks access, nothing is lost: the last known details stay, marked with when they were last confirmed.

### Fit

For each opportunity Atelier explains why it may or may not fit, from your profile: deadline, eligibility (places, age, career stage, students, community-specific calls), discipline, your goals and themes, funding, fees, in person or online, region, length, your availability, your needs, and whether you have the materials it asks for. **Artist Profile › What matters most** sets how much each counts. All of this runs on your Mac; the optional **Explain with AI** adds a written explanation.

### Proposals and application text

- **New proposal (guided)** walks through a summary, project description, planned use of residency time, timeline, outcomes, special requirements and budget.
- In an application’s **Proposal** tab, pick a proposal and **Make a tailored copy**. The original never changes. The **Tailoring checklist** compares your proposal with the call (naming the residency, the place, facilities it mentions, public programs it expects, length of stay, a missing budget, words the call keeps using). With AI turned on, **Suggest edits with AI** proposes changes section by section; accept or discard each one, and toggle **Show changes from original**.
- **Answers** keep each form question with its word or character limit and a live count. Insert saved text, or draft and shorten with AI. AI drafts never invent facts: anything it doesn’t know is marked `[ADD: …]`, and the review flags any left.

### Review before anything is submitted

Atelier never submits an application for you. **Review & submit** shows the whole application (answers, proposal, samples, letters) with a checklist of anything missing, over the limit, or still to verify on the official page. Only after you tick the box and **Confirm review** can you:

- **Export package…** — a folder with a PDF summary, your answers and proposal as text, numbered work samples with a captions file, and attached materials.
- **Open application form** — opens the organizer’s form in your browser, where you submit it yourself.
- **Mark as submitted…** — records the date and a confirmation number.

If you change anything after confirming, the confirmation no longer counts and you review again. Recommendation requests work the same way: you see the full message before Mail opens with it, and you send it yourself.

### Calendar export

**Export to Apple Calendar…** lists upcoming dates. Choose which to include; Atelier opens Calendar, which asks which calendar to add them to. Deadlines, your target dates and letter due dates get reminders (Settings › Calendar). Events keep stable IDs, so exporting again updates them in most cases. **Save .ics file…** saves the file instead.

## Privacy

- Your profile, opportunities, applications, proposals, portfolio and notes live only in `~/Library/Application Support/Atelier/`.
- Reading sources downloads public pages (or pages you can see when signed in through the Atelier browser). Atelier sends nothing about you to those sites.
- **AI is off by default.** If you turn it on, Atelier asks before the first request to each provider, sends only the text the action needs, and lists every request (time, provider, purpose, size — not the content) in **Settings › AI › Show activity**. Your birth year is never sent.
  - **Ollama** runs a model on your Mac: nothing leaves the computer.
  - **Claude (Anthropic API)** uses your own API key, stored in the Keychain. It also enables **Search with Claude**, which searches the web for opportunities.
  - **OpenAI-compatible server** points at any server you choose (for example LM Studio on your Mac).
- **Map**: location names (never anything about you) are looked up with OpenStreetMap’s Nominatim when you ask, and cached. Map images load from CARTO. You can turn lookups off and place opportunities by hand.
- **Secrets** (API keys, tokens) are stored in the macOS Keychain and are never in backups or exports.

## Backups and export

- **Automatic backups** run once a day while Atelier is open and keep the last 14 (Settings › Backups & export). Choose a backup folder on another drive or a synced folder for extra safety. Turn on *Include portfolio files* to back up images, video and audio too.
- **File › Back Up Now**, **Back Up Everything To…** (always includes files), **Restore from Backup…** (makes a safety backup of your current data first), **Export Data…** (a readable folder: everything as JSON, CSV tables of opportunities, applications and portfolio, and proposals and saved text as Markdown), and **Show Data Folder**.
- Data files are written atomically, and the previous version of each is kept, so a damaged file is recovered automatically.

| In the data folder | Contents |
| --- | --- |
| `profile.json`, `settings.json` | Your artist profile and settings |
| `opportunities.json`, `applications.json`, `sources.json`, `contacts.json`, `portfolio.json`, `projects.json`, `proposals.json`, `snippets.json` | Everything else you enter |
| `Portfolio/` | Atelier’s copies of your work samples and attached materials |
| `Snapshots/` | The text of each opportunity page as last seen, for Page history |
| `Backups/`, `Exports/`, `Logs/` | Backups, calendar files, and the activity log (Help › Show Activity Log) |

## Updates

Atelier checks your GitHub releases shortly after it opens and then daily (Settings › Updates). When there’s a new version, a notice appears in the sidebar: **Download and install** replaces the app and reopens it, with no Terminal involved. **Atelier › Check for Updates…** checks right away.

## Customizing

- **Sources**: edit any source’s pages, link pattern, pagination and JavaScript handling, or add your own (Sources › Add source).
- **Fit**: set what matters in Artist Profile › What matters most.
- **Opportunity fields**: add your own fields to any opportunity (Notes & tags › Your own fields), plus tags and notes.
- **Look**: colors and fonts are in `src/renderer/theme.css` (light and dark). Defaults for settings are in `src/config.mjs`. Rebuild with `npm start`, or publish a release.

## Development

You need [Node.js 22+](https://nodejs.org) and npm.

```sh
npm install         # once
npm start           # build the interface and run Atelier from source
npm test            # extraction, provenance and re-checks, fit, discovery against a local test site, calendar, backups
npm run test:e2e    # drives the real app end to end against stand-in websites and saves screenshots to test/.tmp/shots
npm run dist:mac    # on a Mac: builds, ad-hoc signs and zips out/Atelier-<version>-mac-arm64.zip
```

Set `ATELIER_USER_DATA=/some/folder` to run from source with a separate test library.

```
src/config.mjs          app constants and Settings defaults
src/shared/             schema, fit, tailoring, calendar and place names (used by both processes)
src/main/               the app process: data, discovery, extraction, AI, backups, review, updates, menus
src/main/discovery/     sources, crawling, feeds, search, Instagram, page snapshots
src/main/extract/       reading pages: HTML, dates, money, field extraction
src/preload/            the bridges the windows are allowed to use
src/renderer/           the interface (Preact) and the Atelier browser toolbar
test/                   unit tests, a stand-in website, and the end-to-end walkthrough
.github/workflows/      release build on GitHub’s Mac runners
```

## Releasing an update

1. Add a section to `CHANGELOG.md`:
   ```md
   ## 1.1.0
   - What changed
   ```
2. Commit, then tag and push:
   ```sh
   git tag v1.1.0
   git push origin main v1.1.0
   ```
3. The **Release** workflow runs the tests, builds the app on an Apple silicon Mac, signs it ad hoc, and publishes `Atelier-1.1.0-mac-arm64.zip` with your changelog section as the release notes. You can also run it by hand from the repository’s **Actions** tab.

Private repositories get a monthly allowance of GitHub Actions minutes, and macOS minutes count 10× against it. Each release build takes about 5 minutes.

## Troubleshooting

- **A source says “No opportunity links found”**: the site probably changed. Open **Sources**, click the pencil, then **Test**. If Atelier learned a new pattern, click **Use learned pattern**.
- **“The site refused automated access”**: open the page in the Atelier browser (it may ask you to pass a check or sign in), then click **Capture**.
- **A detail looks wrong**: click the pencil and correct it. Your value is kept from then on, and Atelier tells you if the site later says something different.
- **AI buttons are greyed out**: turn on a provider in Settings › AI and click **Test connection**.
- **“Atelier can’t write to …” when installing an update**: move Atelier into Applications, open it from there, and try again.
