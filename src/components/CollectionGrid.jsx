import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useDiscogs } from '../hooks/useDiscogs'
import { useCollection } from '../hooks/useCollection'
import AlbumCard from './AlbumCard'

export default function CollectionGrid() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('added')
  const [filterArtist, setFilterArtist] = useState('')
  const [filterFormat, setFilterFormat] = useState('')
  const [filterNfc, setFilterNfc] = useState('')
  const [filterIndex, setFilterIndex] = useState('')
  const {
    collectionLoading,
    collectionProgress,
    collectionError,
    hasCredentials,
    setSettingsOpen,
    selectedAlbum,
  } = useApp()
  const { loadCollection, selectAlbum } = useDiscogs()
  const { filtered, total, artists, formats } = useCollection(
    search,
    sortBy,
    filterArtist,
    filterFormat,
    filterNfc,
    filterIndex
  )
  const activeFilters = !!(filterArtist || filterFormat || filterNfc || filterIndex)

  const progressPct =
    collectionProgress.total > 0
      ? Math.round((collectionProgress.loaded / collectionProgress.total) * 100)
      : 0

  // Empty state — no credentials
  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 py-16 text-center space-y-4">
        <div className="text-6xl opacity-20">◉</div>
        <h2 className="font-serif text-xl text-white">Your collection awaits</h2>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Connect your Discogs account to browse your vinyl collection and scrobble to Last.fm.
        </p>
        <button
          onClick={() => setSettingsOpen(true)}
          className="mt-2 px-5 py-2.5 bg-accent text-black rounded-lg font-sans font-medium text-sm hover:brightness-110 transition-all"
        >
          Open Settings
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + sort bar */}
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search artist, title, genre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-sans text-white placeholder-text-secondary focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
        {/* Filters: artist, format, NFC status */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterArtist}
            onChange={(e) => setFilterArtist(e.target.value)}
            title="Filtrar por artista"
            className={`min-w-0 flex-1 text-xs font-sans bg-card border rounded-lg px-2 py-1.5 outline-none cursor-pointer transition-colors ${
              filterArtist ? 'border-accent/60 text-white' : 'border-border text-text-secondary'
            }`}
          >
            <option value="">Todos los artistas</option>
            {artists.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={filterFormat}
            onChange={(e) => setFilterFormat(e.target.value)}
            title="Filtrar por formato"
            className={`text-xs font-sans bg-card border rounded-lg px-2 py-1.5 outline-none cursor-pointer transition-colors ${
              filterFormat ? 'border-accent/60 text-white' : 'border-border text-text-secondary'
            }`}
          >
            <option value="">Formato</option>
            {formats.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          <select
            value={filterNfc}
            onChange={(e) => setFilterNfc(e.target.value)}
            title="Filtrar por estado del NFC"
            className={`text-xs font-sans bg-card border rounded-lg px-2 py-1.5 outline-none cursor-pointer transition-colors ${
              filterNfc ? 'border-accent/60 text-white' : 'border-border text-text-secondary'
            }`}
          >
            <option value="">NFC</option>
            <option value="yes">NFC grabado</option>
            <option value="no">NFC sin grabar</option>
          </select>

          <select
            value={filterIndex}
            onChange={(e) => setFilterIndex(e.target.value)}
            title="Filtrar por pistas con sub-índices (suites)"
            className={`text-xs font-sans bg-card border rounded-lg px-2 py-1.5 outline-none cursor-pointer transition-colors ${
              filterIndex ? 'border-accent/60 text-white' : 'border-border text-text-secondary'
            }`}
          >
            <option value="">Índices</option>
            <option value="with">Con índices</option>
            <option value="without">Sin índices</option>
          </select>

          {activeFilters && (
            <button
              onClick={() => {
                setFilterArtist('')
                setFilterFormat('')
                setFilterNfc('')
                setFilterIndex('')
              }}
              title="Quitar filtros"
              className="text-xs font-sans text-text-secondary hover:text-white px-2 py-1.5 rounded-lg border border-border hover:border-accent/40 transition-colors shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary font-sans">
            {collectionLoading
              ? `Loading ${collectionProgress.loaded}/${collectionProgress.total}…`
              : `${filtered.length}${filtered.length !== total ? ` of ${total}` : ''} records`}
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs font-sans text-text-secondary bg-transparent border-none outline-none cursor-pointer"
          >
            <option value="added">Recently added</option>
            <option value="artist">Artist</option>
            <option value="title">Title</option>
            <option value="year">Year</option>
          </select>
        </div>
      </div>

      {/* Loading progress bar */}
      {collectionLoading && (
        <div className="mx-4 progress-bar-track mb-2">
          <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* Error state */}
      {collectionError && (
        <div className="mx-4 mb-3 bg-red-900/30 border border-red-700/40 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400 font-sans">{collectionError}</p>
          <button
            onClick={loadCollection}
            className="text-xs text-accent hover:underline font-sans shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!collectionLoading && total === 0 && !collectionError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="text-5xl opacity-20">◉</div>
            <p className="font-sans text-sm text-text-secondary">
              No records found in your Discogs collection.
            </p>
            <button onClick={loadCollection} className="text-xs text-accent hover:underline font-sans">
              Refresh
            </button>
          </div>
        ) : filtered.length === 0 && search ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="font-sans text-sm text-text-secondary">No results for "{search}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((release) => (
              <AlbumCard
                key={release.id}
                release={release}
                isSelected={selectedAlbum?.id === release.id}
                onClick={() => selectAlbum(release)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
