// Conservative track-duration lookup from MusicBrainz (CORS-enabled, free, no key).
// Used only when Discogs has no duration for a track. If no confident match is
// found, returns null → the UI shows no time (per the "si no, no marques" rule).

const MB_BASE = 'https://musicbrainz.org/ws/2/recording'
const RATE_LIMIT_MS = 1100 // MusicBrainz allows ~1 request/sec per IP
const CACHE_KEY = 'vinyl_duration_cache'
const MAX_CACHE = 1000
const NOT_FOUND = -1 // sentinel stored in cache so we don't re-query misses
const MIN_SCORE = 90 // conservative acceptance threshold

function norm(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // drop parenthetical notes
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ---- localStorage cache ----
function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}
  } catch {
    return {}
  }
}
function saveCache(cache) {
  try {
    const keys = Object.keys(cache)
    if (keys.length > MAX_CACHE) {
      const sorted = keys.sort((a, b) => (cache[a]._t || 0) - (cache[b]._t || 0))
      sorted.slice(0, keys.length - MAX_CACHE).forEach((k) => delete cache[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota — ignore */
  }
}

// ---- rate-limit queue (serial, 1 req / ~1.1s) ----
let chain = Promise.resolve()
function enqueue(fn) {
  const run = chain.then(fn)
  chain = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, RATE_LIMIT_MS)))
  return run
}

function cacheKey(artist, title, album) {
  return `${norm(artist)}|${norm(title)}|${norm(album)}`
}

// Synchronous cache read (no network), so already-resolved durations show
// instantly on reload instead of being re-fetched.
// Returns: number (seconds) | null (known miss) | undefined (not cached yet).
export function getCachedDuration({ artist, title, album }) {
  if (!artist || !title) return undefined
  const cache = loadCache()
  const key = cacheKey(artist, title, album)
  if (!(key in cache)) return undefined
  const v = cache[key].s
  return v === NOT_FOUND ? null : v
}

// Returns seconds (number) or null.
export async function lookupDuration({ artist, title, album }) {
  if (!artist || !title) return null

  const key = cacheKey(artist, title, album)
  const cache = loadCache()
  if (key in cache) {
    const v = cache[key].s
    return v === NOT_FOUND ? null : v
  }

  const seconds = await enqueue(() => queryMusicBrainz(artist, title, album))

  cache[key] = { s: seconds == null ? NOT_FOUND : seconds, _t: Date.now() }
  saveCache(cache)
  return seconds
}

async function queryMusicBrainz(artist, title, album) {
  try {
    const lucene = [
      `recording:"${title.replace(/"/g, '')}"`,
      `artist:"${artist.replace(/"/g, '')}"`,
      album ? `release:"${album.replace(/"/g, '')}"` : null,
    ]
      .filter(Boolean)
      .join(' AND ')

    const url = `${MB_BASE}?query=${encodeURIComponent(lucene)}&fmt=json&limit=5`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const recordings = data.recordings || []

    const wantTitle = norm(title)
    const wantAlbum = norm(album)

    // Conservative pick: high score, title matches, length present, and (if we
    // know the album) a release whose title matches the album.
    const candidates = recordings.filter((r) => {
      if (typeof r.length !== 'number' || r.length <= 0) return false
      if ((r.score ?? 0) < MIN_SCORE) return false
      if (norm(r.title) !== wantTitle) return false
      if (wantAlbum) {
        const releaseMatch = (r.releases || []).some((rel) => norm(rel.title) === wantAlbum)
        if (!releaseMatch) return false
      }
      return true
    })

    if (candidates.length === 0) return null
    // Prefer the highest score
    candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return Math.round(candidates[0].length / 1000)
  } catch {
    return null
  }
}
