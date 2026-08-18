// Synced lyrics from LRCLIB (free, no key, CORS-enabled).
// https://lrclib.net/docs — returns LRC-format `syncedLyrics` when available.

const CACHE_KEY = 'vinyl_lyrics_cache'
const memo = new Map()

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCache(all) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    /* quota — skip persisting */
  }
}

// Parse LRC ("[01:23.45] line", possibly several stamps per line) into a sorted
// array of { time, text }. Blank lines are kept: they render as musical pauses.
export function parseLRC(lrc) {
  if (!lrc) return []
  const out = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (stamps.length === 0) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) {
      const frac = m[3] ? Number(`0.${m[3]}`) : 0
      out.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

// Look up lyrics for a track. Returns { synced: [{time,text}], plain, found }.
export async function fetchLyrics({ artist, track, album, duration }) {
  const key = [artist, track, album, duration || ''].join('|').toLowerCase()
  if (memo.has(key)) return memo.get(key)
  const disk = loadCache()
  if (disk[key]) {
    const hit = { ...disk[key], synced: parseLRC(disk[key].lrc) }
    memo.set(key, hit)
    return hit
  }

  const params = new URLSearchParams({ artist_name: artist || '', track_name: track || '' })
  if (album) params.set('album_name', album)
  if (duration) params.set('duration', String(Math.round(duration)))

  let data = null
  try {
    // Exact match first; fall back to a fuzzy search when there's no exact hit.
    let res = await fetch(`https://lrclib.net/api/get?${params}`)
    if (res.ok) data = await res.json()
    else {
      const q = new URLSearchParams({ track_name: track || '', artist_name: artist || '' })
      res = await fetch(`https://lrclib.net/api/search?${q}`)
      if (res.ok) {
        const list = await res.json()
        data = Array.isArray(list) ? list.find((x) => x.syncedLyrics) || list[0] : null
      }
    }
  } catch {
    data = null
  }

  const result = {
    found: !!data,
    instrumental: !!data?.instrumental,
    lrc: data?.syncedLyrics || '',
    plain: data?.plainLyrics || '',
    synced: parseLRC(data?.syncedLyrics),
  }
  memo.set(key, result)
  const next = loadCache()
  next[key] = { found: result.found, instrumental: result.instrumental, lrc: result.lrc, plain: result.plain }
  saveCache(next)
  return result
}
