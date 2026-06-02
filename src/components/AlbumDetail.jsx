import { useState, useMemo, useCallback, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useLastfm } from '../hooks/useLastfm'
import { groupTracksByDisc, getDiscLabels } from '../utils/tracklist'
import { lookupDuration } from '../utils/duration'
import TrackList from './TrackList'
import DiscSelector from './DiscSelector'
import ScrobbleButton from './ScrobbleButton'
import NfcButton from './NfcButton'

export default function AlbumDetail() {
  const { selectedAlbum, setSelectedAlbum } = useApp()
  const [checkedTracks, setCheckedTracks] = useState(new Set())
  const [selectedDisc, setSelectedDisc] = useState(0)  // 0 = All Discs
  const [resolvedDurations, setResolvedDurations] = useState({}) // trackKey -> seconds (from MusicBrainz)
  const { scrobbleState, scrobble, reset } = useLastfm()

  // Reset selection when album changes
  useEffect(() => {
    setCheckedTracks(new Set())
    setSelectedDisc(0)
    setResolvedDurations({})
    reset()
  }, [selectedAlbum?.id])

  const baseDiscGroups = useMemo(
    () => groupTracksByDisc(selectedAlbum?.tracklist ?? [], selectedAlbum),
    [selectedAlbum]
  )

  // Overlay any durations resolved from MusicBrainz onto the grouped tracks, so
  // both the display and the scrobble payload pick them up.
  const discGroups = useMemo(() => {
    if (Object.keys(resolvedDurations).length === 0) return baseDiscGroups
    const patchLeaf = (t) => {
      if (t._durationSecs != null) return t
      const secs = resolvedDurations[t.position || t.title]
      return secs != null ? { ...t, _durationSecs: secs } : t
    }
    const out = {}
    for (const [disc, tracks] of Object.entries(baseDiscGroups)) {
      out[disc] = tracks.map((t) => {
        if (t._hasSubTracks && t._subTracks) {
          const subs = t._subTracks.map(patchLeaf)
          const total = subs.every((s) => s._durationSecs != null)
            ? subs.reduce((sum, s) => sum + s._durationSecs, 0)
            : null
          return { ...t, _subTracks: subs, _totalDuration: total }
        }
        return patchLeaf(t)
      })
    }
    return out
  }, [baseDiscGroups, resolvedDurations])

  // Look up missing durations from MusicBrainz (conservative, rate-limited).
  useEffect(() => {
    if (!selectedAlbum || selectedAlbum._loading) return
    let cancelled = false

    const albumTitle = selectedAlbum.title
    const albumArtist =
      selectedAlbum.artists?.map((a) => a.name?.replace(/ \(\d+\)$/, '')).join(', ') || ''

    // Collect unique leaf tracks (and sub-tracks) that have no known duration.
    const missing = []
    const seen = new Set()
    for (const tracks of Object.values(baseDiscGroups)) {
      for (const t of tracks) {
        const leaves = t._hasSubTracks && t._subTracks ? t._subTracks : [t]
        for (const leaf of leaves) {
          if (!leaf._isSelectable || leaf._durationSecs != null) continue
          const key = leaf.position || leaf.title
          if (!key || seen.has(key)) continue
          seen.add(key)
          missing.push({ key, title: leaf.title })
        }
      }
    }
    if (missing.length === 0) return

    ;(async () => {
      for (const { key, title } of missing) {
        if (cancelled) return
        const secs = await lookupDuration({ artist: albumArtist, title, album: albumTitle })
        if (cancelled) return
        if (secs != null) setResolvedDurations((prev) => ({ ...prev, [key]: secs }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [baseDiscGroups, selectedAlbum])
  // Derive disc count from actual grouped data — avoids phantom discs from format metadata
  const discCount = Object.keys(discGroups).length
  const discLabels = useMemo(() => getDiscLabels(selectedAlbum), [selectedAlbum])

  // Use the disc's FIRST top-level section heading as its label (the album-intro
  // heading); later headings are sub-sections ("Act I/II") or trailing orphans.
  // Falls back to the format name ("CD") when the disc has no heading.
  // E.g. "Live At La Cigale (29/4/1994)..." beats a generic "CD" label.
  const mergedDiscLabels = useMemo(() => {
    const result = {}
    for (const [key, tracks] of Object.entries(discGroups)) {
      const disc = Number(key)
      const firstHeading = tracks.find(
        (t) => (t._isIndex || t._isHeading) && !t._hasSubTracks
      )
      if (firstHeading) {
        result[disc] = firstHeading.title
      } else if (discLabels[disc]) {
        result[disc] = discLabels[disc]
      }
    }
    return result
  }, [discGroups, discLabels])

  const artist = selectedAlbum?.artists
    ?.map((a) => a.name?.replace(/ \(\d+\)$/, ''))
    .join(', ') || ''

  const artUrl = selectedAlbum?.images?.[0]?.uri || selectedAlbum?.images?.[0]?.resource_url

  const label = selectedAlbum?.labels?.[0]?.name
  const country = selectedAlbum?.country
  const format = selectedAlbum?.formats?.[0]
  const formatName = format
    ? [format.name, ...(format.descriptions || [])].filter(Boolean).join(', ')
    : ''
  const genres = selectedAlbum?.genres || []
  const styles = selectedAlbum?.styles || []

  // Build a unique track key for use in the checkedTracks Set
  function trackKey(track) {
    return track.position ? `${track.position}` : track.title
  }

  // All tracks flattened in disc order — used by the "All Discs" tab
  const allDiscsTracks = useMemo(
    () =>
      Object.keys(discGroups)
        .sort((a, b) => Number(a) - Number(b))
        .flatMap((k) => discGroups[k]),
    [discGroups]
  )

  const currentDisc = selectedDisc === 0 ? allDiscsTracks : (discGroups[selectedDisc] ?? [])

  // Collect all selectable track keys on the current disc
  const allSelectableKeys = useMemo(() => {
    const keys = []
    for (const track of currentDisc) {
      if (track._hasSubTracks && track._subTracks) {
        track._subTracks.forEach((s) => keys.push(trackKey(s)))
      } else if (track._isSelectable) {
        keys.push(trackKey(track))
      }
    }
    return keys
  }, [currentDisc])

  const handleToggle = useCallback((track) => {
    const key = trackKey(track)
    setCheckedTracks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Toggle all sub-tracks of a group (index section or parent track) at once.
  // If all are checked → deselect all; otherwise → select all.
  const handleGroupToggle = useCallback((subTracks) => {
    const keys = subTracks.map((s) => s.position || s.title)
    setCheckedTracks((prev) => {
      const allChecked = keys.every((k) => prev.has(k))
      const next = new Set(prev)
      if (allChecked) {
        keys.forEach((k) => next.delete(k))
      } else {
        keys.forEach((k) => next.add(k))
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setCheckedTracks((prev) => {
      const next = new Set(prev)
      allSelectableKeys.forEach((k) => next.add(k))
      return next
    })
  }, [allSelectableKeys])

  const handleDeselectAll = useCallback(() => {
    setCheckedTracks((prev) => {
      const next = new Set(prev)
      allSelectableKeys.forEach((k) => next.delete(k))
      return next
    })
  }, [allSelectableKeys])

  const handleSelectDisc = useCallback(
    (disc) => {
      const keys = []
      for (const track of discGroups[disc] ?? []) {
        if (track._hasSubTracks && track._subTracks) {
          track._subTracks.forEach((s) => keys.push(trackKey(s)))
        } else if (track._isSelectable) {
          keys.push(trackKey(track))
        }
      }
      setCheckedTracks((prev) => {
        const next = new Set(prev)
        keys.forEach((k) => next.add(k))
        return next
      })
    },
    [discGroups]
  )

  // All selectable tracks from every disc — for the one-tap "scrobble album" button
  const allTracksForScrobble = useMemo(() => {
    const result = []
    for (const disc of Object.values(discGroups)) {
      for (const track of disc) {
        if (track._hasSubTracks && track._subTracks) {
          track._subTracks.forEach((s) => {
            const scrobbleTitle = s._indexTitle ? `${s._indexTitle} (${s.title})` : s.title
            result.push({ ...s, title: scrobbleTitle, _artist: artist, _album: selectedAlbum?.title })
          })
        } else if (track._isSelectable) {
          result.push({ ...track, _artist: artist, _album: selectedAlbum?.title })
        }
      }
    }
    return result
  }, [discGroups, artist, selectedAlbum])

  const handleScrobbleAll = useCallback(() => {
    scrobble(allTracksForScrobble, artist, selectedAlbum?.title)
  }, [scrobble, allTracksForScrobble, artist, selectedAlbum])

  // Collect all checked+selectable tracks for scrobbling
  const selectedTracksForScrobble = useMemo(() => {
    const result = []
    for (const disc of Object.values(discGroups)) {
      for (const track of disc) {
        if (track._hasSubTracks && track._subTracks) {
          track._subTracks.forEach((s) => {
            if (checkedTracks.has(trackKey(s))) {
              // Format: "movement title (Suite Name)" when parent is an index/heading section
              const scrobbleTitle = s._indexTitle ? `${s._indexTitle} (${s.title})` : s.title
              result.push({ ...s, title: scrobbleTitle, _artist: artist, _album: selectedAlbum?.title })
            }
          })
        } else if (track._isSelectable && checkedTracks.has(trackKey(track))) {
          result.push({ ...track, _artist: artist, _album: selectedAlbum?.title })
        }
      }
    }
    return result
  }, [checkedTracks, discGroups, artist, selectedAlbum])

  const handleScrobble = useCallback(() => {
    scrobble(selectedTracksForScrobble, artist, selectedAlbum?.title)
  }, [scrobble, selectedTracksForScrobble, artist, selectedAlbum])

  if (!selectedAlbum) return null

  return (
    <div className="relative min-h-full">
      {/* Dynamic blurred art background */}
      {artUrl && (
        <div
          className="dynamic-bg"
          style={{ backgroundImage: `url(${artUrl})` }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 p-5 space-y-5 fade-in">
        {/* Mobile back button */}
        <button
          onClick={() => setSelectedAlbum(null)}
          className="md:hidden flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition-colors font-sans"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Collection
        </button>

        {/* Album header */}
        <div className="flex gap-4 items-start">
          <div className="shrink-0 w-28 h-28 rounded-xl overflow-hidden shadow-2xl bg-border">
            {artUrl ? (
              <img src={artUrl} alt={selectedAlbum.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-3xl text-text-secondary opacity-30">◉</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h2 className="font-serif text-xl text-white leading-tight line-clamp-2">
              {selectedAlbum.title}
            </h2>
            <p className="font-sans text-sm text-text-secondary mt-1">{artist}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
              {selectedAlbum.year > 0 && (
                <span className="font-mono text-xs text-text-secondary">{selectedAlbum.year}</span>
              )}
              {label && <span className="font-mono text-xs text-text-secondary">{label}</span>}
              {country && <span className="font-mono text-xs text-text-secondary">{country}</span>}
            </div>
            {formatName && (
              <p className="font-mono text-xs text-text-secondary mt-1 opacity-70">{formatName}</p>
            )}
          </div>

          {/* One-tap scrobble entire album — top-right of header */}
          {!selectedAlbum._loading && allTracksForScrobble.length > 0 && (
            <button
              onClick={handleScrobbleAll}
              disabled={scrobbleState.status === 'loading'}
              title={`Scrobble all ${allTracksForScrobble.length} tracks`}
              className="shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border border-border bg-card/60 hover:border-accent/50 hover:bg-card disabled:opacity-40 transition-all group"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                className="text-text-secondary group-hover:text-accent transition-colors">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <span className="text-xs font-sans text-text-secondary group-hover:text-accent transition-colors leading-none">
                Scrobble<br />album
              </span>
            </button>
          )}
        </div>

        {/* Genres + styles */}
        {(genres.length > 0 || styles.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {[...genres, ...styles].map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-card/80 border border-border rounded-full text-xs font-sans text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Loading / error states */}
        {selectedAlbum._loading && (
          <div className="flex items-center gap-2 text-sm text-text-secondary font-sans">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Loading tracklist…
          </div>
        )}
        {selectedAlbum._error && (
          <p className="text-sm text-red-400 font-sans">{selectedAlbum._error}</p>
        )}

        {/* Disc selector */}
        {!selectedAlbum._loading && discCount > 1 && (
          <DiscSelector
            discCount={discCount}
            selectedDisc={selectedDisc}
            onSelect={setSelectedDisc}
            onSelectDisc={handleSelectDisc}
            discLabels={mergedDiscLabels}
          />
        )}

        {/* Tracklist */}
        {!selectedAlbum._loading && currentDisc.length > 0 && (
          <div className="bg-card/60 backdrop-blur-sm rounded-xl p-4 border border-border/50">
            <TrackList
              tracks={currentDisc}
              checkedTracks={checkedTracks}
              onToggle={handleToggle}
              onGroupToggle={handleGroupToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          </div>
        )}

        {/* Action bar */}
        {!selectedAlbum._loading && (
          <div className="flex flex-wrap items-start gap-3 pt-1 pb-6">
            <ScrobbleButton
              checkedCount={checkedTracks.size}
              scrobbleState={scrobbleState}
              onScrobble={handleScrobble}
              onReset={reset}
            />
            {selectedAlbum.id && <NfcButton releaseId={selectedAlbum.id} />}
          </div>
        )}
      </div>
    </div>
  )
}
