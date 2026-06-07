import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getAllReleases, putRelease, deleteReleases } from '../utils/releaseDB'

const STORAGE_KEYS = {
  credentials: 'vinyl_credentials',
  releaseCache: 'vinyl_release_cache', // legacy (localStorage) — migrated to IndexedDB
  collection: 'vinyl_collection',
  prefs: 'vinyl_prefs',
  edits: 'vinyl_edits',
}

const MAX_CACHE_ENTRIES = 500

// A per-release edit object carries no information → can be dropped.
function isEmptyEdit(c) {
  return (
    (!c.titles || Object.keys(c.titles).length === 0) &&
    (!c.discs || Object.keys(c.discs).length === 0) &&
    (!c.discAsAlbum || Object.keys(c.discAsAlbum).length === 0) &&
    (!c.discStyle || Object.keys(c.discStyle).length === 0) &&
    !c.joinHeadings &&
    !c.nfc
  )
}

function loadFromStorage(key, fallback) {
  try {
    const val = localStorage.getItem(key)
    return val ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

function evictOldestIfNeeded(cache) {
  const ids = Object.keys(cache)
  if (ids.length <= MAX_CACHE_ENTRIES) return cache
  // Each entry has a _cachedAt timestamp — evict oldest
  const sorted = ids.sort((a, b) => (cache[a]._cachedAt || 0) - (cache[b]._cachedAt || 0))
  const toEvict = sorted.slice(0, ids.length - MAX_CACHE_ENTRIES)
  const next = { ...cache }
  toEvict.forEach((id) => delete next[id])
  return next
}

// Drop the heavy fields we never render so far more releases fit in the ~5 MB
// localStorage quota (full Discogs detail objects are large — videos, community
// stats, the full images array, etc.).
function slimRelease(detail) {
  if (!detail || typeof detail !== 'object') return detail
  const { community, videos, companies, identifiers, series, extraartists, ...rest } = detail
  return { ...rest, images: Array.isArray(detail.images) ? detail.images.slice(0, 1) : detail.images }
}


export const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [credentials, setCredentialsState] = useState(() =>
    loadFromStorage(STORAGE_KEYS.credentials, {
      discogsToken: '',
      discogsUsername: '',
      lastfmKey: '',
      lastfmSecret: '',
      lastfmUsername: '',
      lastfmSessionKey: '',
    })
  )

  // Collection list is persisted so it shows instantly on reload instead of
  // re-downloading every record from Discogs each time.
  const [collection, setCollectionState] = useState(() =>
    loadFromStorage(STORAGE_KEYS.collection, [])
  )
  const setCollection = useCallback((releases) => {
    setCollectionState(releases)
    try {
      localStorage.setItem(STORAGE_KEYS.collection, JSON.stringify(releases))
    } catch {
      // quota exceeded (very large collection) — skip persisting, will refetch
    }
  }, [])
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionProgress, setCollectionProgress] = useState({ loaded: 0, total: 0 })
  const [collectionError, setCollectionError] = useState(null)
  const [selectedAlbum, setSelectedAlbum] = useState(null)

  // In-memory release cache, persisted to IndexedDB (not localStorage — see
  // releaseDB.js). Loaded asynchronously on mount; legacy localStorage cache is
  // migrated over and then removed to free up the localStorage quota.
  const [releaseCache, setReleaseCacheState] = useState({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await getAllReleases()
      const map = {}
      for (const r of all) map[String(r.id)] = r
      // One-time migration of any old localStorage cache.
      let legacy = {}
      try {
        legacy = JSON.parse(localStorage.getItem(STORAGE_KEYS.releaseCache) || '{}')
      } catch {
        legacy = {}
      }
      const legacyIds = Object.keys(legacy)
      if (legacyIds.length) {
        for (const id of legacyIds) {
          const key = String(id)
          if (!map[key]) {
            const entry = { ...legacy[id], id: key }
            map[key] = entry
            putRelease(entry)
          }
        }
        try {
          localStorage.removeItem(STORAGE_KEYS.releaseCache)
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setReleaseCacheState(map)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const [settingsOpen, setSettingsOpen] = useState(() => {
    const creds = loadFromStorage(STORAGE_KEYS.credentials, {})
    return !creds.discogsToken
  })

  const saveCredentials = useCallback((creds) => {
    setCredentialsState(creds)
    localStorage.setItem(STORAGE_KEYS.credentials, JSON.stringify(creds))
  }, [])

  // App preferences (advanced/hidden options).
  const [prefs, setPrefsState] = useState(() =>
    loadFromStorage(STORAGE_KEYS.prefs, { joinDiscHeadings: false })
  )
  const setPrefs = useCallback((next) => {
    setPrefsState((prev) => {
      const merged = { ...prev, ...next }
      try {
        localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(merged))
      } catch {
        /* ignore */
      }
      return merged
    })
  }, [])

  // Per-release edits (track/heading/disc names + per-release join toggle),
  // keyed by release id. Persisted locally for instant/offline use and synced
  // to the cloud (Vercel KV) by the user's Discogs username.
  const [edits, setEditsState] = useState(() => loadFromStorage(STORAGE_KEYS.edits, {}))

  const persistEditsLocal = useCallback((all) => {
    try {
      localStorage.setItem(STORAGE_KEYS.edits, JSON.stringify(all))
    } catch {
      /* ignore */
    }
  }, [])

  // Pull cloud edits once credentials (the Discogs username key) are available.
  const discogsUser = credentials.discogsUsername
  useEffect(() => {
    if (!discogsUser) return
    let cancelled = false
    fetch(`/api/edits?user=${encodeURIComponent(discogsUser)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cloud) => {
        if (cancelled || !cloud || typeof cloud !== 'object') return
        if (Object.keys(cloud).length === 0) return
        setEditsState(cloud)
        persistEditsLocal(cloud)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [discogsUser, persistEditsLocal])

  // Persist locally + best-effort cloud sync of the whole edits map.
  const persistAndSyncEdits = useCallback(
    (next) => {
      persistEditsLocal(next)
      if (discogsUser) {
        fetch(`/api/edits?user=${encodeURIComponent(discogsUser)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }
    },
    [discogsUser, persistEditsLocal]
  )

  const saveReleaseEdits = useCallback(
    (releaseId, releaseEdits) => {
      setEditsState((prev) => {
        const next = { ...prev }
        // Preserve a previously-set NFC flag when saving editor changes.
        const clean = { ...(releaseEdits || {}) }
        if (prev[releaseId]?.nfc && clean.nfc === undefined) clean.nfc = true
        if (isEmptyEdit(clean)) delete next[releaseId]
        else next[releaseId] = clean
        persistAndSyncEdits(next)
        return next
      })
    },
    [persistAndSyncEdits]
  )

  // Mark/unmark whether the NFC tag for a release has been written.
  const setReleaseNfc = useCallback(
    (releaseId, written) => {
      setEditsState((prev) => {
        const nextEdit = { ...(prev[releaseId] || {}) }
        if (written) nextEdit.nfc = true
        else delete nextEdit.nfc
        const next = { ...prev }
        if (isEmptyEdit(nextEdit)) delete next[releaseId]
        else next[releaseId] = nextEdit
        persistAndSyncEdits(next)
        return next
      })
    },
    [persistAndSyncEdits]
  )

  const cacheRelease = useCallback((id, detail) => {
    const key = String(detail?.id ?? id)
    const entry = { ...slimRelease(detail), id: key, _cachedAt: Date.now() }
    putRelease(entry) // write-through to IndexedDB (huge quota, async)
    setReleaseCacheState((prev) => {
      const merged = { ...prev, [key]: entry }
      const capped = evictOldestIfNeeded(merged)
      if (capped !== merged) {
        const removed = Object.keys(merged).filter((k) => !(k in capped))
        deleteReleases(removed) // keep IndexedDB in sync with the in-memory cap
      }
      return capped
    })
  }, [])

  const hasCredentials = !!(credentials.discogsToken && credentials.discogsUsername)

  return (
    <AppContext.Provider
      value={{
        credentials,
        saveCredentials,
        hasCredentials,
        collection,
        setCollection,
        collectionLoading,
        setCollectionLoading,
        collectionProgress,
        setCollectionProgress,
        collectionError,
        setCollectionError,
        selectedAlbum,
        setSelectedAlbum,
        releaseCache,
        cacheRelease,
        settingsOpen,
        setSettingsOpen,
        prefs,
        setPrefs,
        edits,
        saveReleaseEdits,
        setReleaseNfc,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
