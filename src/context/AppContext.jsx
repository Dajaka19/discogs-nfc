import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const STORAGE_KEYS = {
  credentials: 'vinyl_credentials',
  releaseCache: 'vinyl_release_cache',
  collection: 'vinyl_collection',
  prefs: 'vinyl_prefs',
  edits: 'vinyl_edits',
}

const MAX_CACHE_ENTRIES = 200

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

  const [releaseCache, setReleaseCacheState] = useState(() =>
    loadFromStorage(STORAGE_KEYS.releaseCache, {})
  )

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

  const saveReleaseEdits = useCallback(
    (releaseId, releaseEdits) => {
      setEditsState((prev) => {
        const next = { ...prev }
        const clean = releaseEdits || {}
        const empty =
          (!clean.titles || Object.keys(clean.titles).length === 0) &&
          (!clean.discs || Object.keys(clean.discs).length === 0) &&
          (!clean.discAsAlbum || Object.keys(clean.discAsAlbum).length === 0) &&
          !clean.joinHeadings
        if (empty) delete next[releaseId]
        else next[releaseId] = clean
        persistEditsLocal(next)
        // Sync to cloud (best-effort).
        if (discogsUser) {
          fetch(`/api/edits?user=${encodeURIComponent(discogsUser)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          }).catch(() => {})
        }
        return next
      })
    },
    [discogsUser, persistEditsLocal]
  )

  const cacheRelease = useCallback((id, detail) => {
    setReleaseCacheState((prev) => {
      const next = evictOldestIfNeeded({
        ...prev,
        [id]: { ...detail, _cachedAt: Date.now() },
      })
      try {
        localStorage.setItem(STORAGE_KEYS.releaseCache, JSON.stringify(next))
      } catch {
        // localStorage quota exceeded — skip persisting
      }
      return next
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
