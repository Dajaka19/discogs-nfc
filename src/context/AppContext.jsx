import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEYS = {
  credentials: 'vinyl_credentials',
  releaseCache: 'vinyl_release_cache',
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

  const [collection, setCollection] = useState([])
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
