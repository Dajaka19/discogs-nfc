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

## Tech Stack

- React 18 + Vite 5
- Tailwind CSS
- Native `fetch` — no axios
- Pure JS MD5 for Last.fm request signing — no external crypto library
- All credentials stored in `localStorage` — nothing leaves your browser
