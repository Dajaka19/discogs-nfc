# Vinyl Collection Manager

Browse your Discogs vinyl collection and scrobble to Last.fm — entirely client-side, no backend.

## Setup

### 1. Discogs Personal Access Token

1. Log in to [discogs.com](https://www.discogs.com)
2. Go to **Settings → Developers** (or visit `discogs.com/settings/developers`)
3. Click **Generate new token**
4. Copy the token — you'll paste it in the app settings

### 2. Last.fm API Key & Secret

1. Visit [last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Fill in the application name (e.g. "Vinyl Collection") and submit
3. Copy your **API key** and **Shared secret**

### 3. Run the App

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

On first load, the Settings modal will open automatically. Enter your Discogs credentials and Last.fm API credentials, then click **Authenticate with Last.fm** to get a session key for scrobbling.

## Features

- Browse your full Discogs collection with cover art
- Search and sort by artist, title, year, or date added
- Full tracklist view with disc/side grouping
- Select tracks and scrobble them to Last.fm with correct timestamps
- NFC tag writing to quickly identify records (see below)
- Release details cached in localStorage for fast reloading

## NFC Tag Writing

The **Write NFC** button requires the [NFC Tools](https://www.wakdev.com/en/apps/nfc-tools.html) app (free on iOS App Store and Google Play).

**Flow:** Tap "Write NFC Tag" → NFC Tools opens pre-filled with the Discogs release URL → hold your phone to the tag → done.

The tag stores `https://www.discogs.com/release/{id}`. When scanned, any phone opens the Discogs release page directly.

A **Copy URL** button is also available if you prefer writing tags with a different app.

> **Note:** The Web NFC API is only supported on Android Chrome, not iOS Safari. The NFC Tools URL scheme approach works on both platforms with the free app installed.

## Native iOS app (free, no Mac) — `vinylnfc://` scheme

A thin native wrapper (Capacitor) lets the app register a custom URL scheme
`vinylnfc://`, so an NFC tag holding `vinylnfc://release/<id>` can try to open the app
directly instead of Safari. Built for free on GitHub's macOS runners and
sideloaded with a free Apple ID — no Mac and no paid Apple account required.

### 1. Build the IPA (GitHub Actions, free)
1. Push to `main` (or open the repo's **Actions** tab → **Build iOS IPA (unsigned)** → **Run workflow**).
2. When it finishes, open the run → **Artifacts** → download **Vinyl-ipa** (`Vinyl-unsigned.ipa`).

### 2. Install it (Windows, free Apple ID)
1. Install [Sideloadly](https://sideloadly.io) on your PC.
2. Connect the iPhone by USB, open Sideloadly, drag in `Vinyl-unsigned.ipa`.
3. Enter your **free** Apple ID → Start. Sideloadly signs and installs it.
4. On the iPhone: **Settings → General → VPN & Device Management** → trust your Apple ID.

> The app loads the live Vercel site, so web updates appear automatically — you only
> rebuild the IPA if the native config changes.

### 3. Write a tag for the app
Write `vinylnfc://release/<id>` to the tag (e.g. `vinylnfc://release/2966489`) with any
NFC writer app. Tapping it will *try* to open the app at that release.

### Caveats (honest)
- **7-day expiry:** apps signed with a free Apple ID stop working after 7 days and
  must be re-installed/re-signed (SideStore can auto-refresh on-device).
- **NFC + custom scheme is not guaranteed:** iOS's passive background tag reader is
  designed to open `http/https` in Safari; whether it offers to open a `vinylnfc://`
  scheme from a passive tap varies. The reliable "tag → app" path on iOS is
  Universal Links, which require a **paid** Apple Developer account. This free route
  is the closest no-cost attempt.

## Tech Stack

- React 18 + Vite 5
- Tailwind CSS
- Native `fetch` — no axios
- Pure JS MD5 for Last.fm request signing — no external crypto library
- All credentials stored in `localStorage` — nothing leaves your browser
