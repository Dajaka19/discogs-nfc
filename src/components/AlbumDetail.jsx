import { useState, useMemo, useCallback, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useLastfm } from '../hooks/useLastfm'
import { useDiscogs } from '../hooks/useDiscogs'
import { groupTracksByDisc, getDiscLabels, trackArtistString } from '../utils/tracklist'
import { lookupDuration, getCachedDuration } from '../utils/duration'

// Spanish (and other) reissues list a translated title after " = " (a Discogs
// convention). Strip it for scrobbling so Last.fm gets the canonical title.
// e.g. "Help! = Socorro" → "Help!". Parentheses are left untouched (they may be
// versions like "(Live)" / "(Instrumental)").
function cleanScrobbleTitle(title) {
  if (!title) return title
  const i = title.search(/\s+=\s+/)
  return (i >= 0 ? title.slice(0, i) : title).trim()
}

// Build a Last.fm scrobble payload from a flat track array (handles sub-tracks,
// skips non-scrobblable rows, cleans titles, prefixes movement index names).
function buildScrobbleList(tracks, artist, album) {
  const out = []
  for (const track of tracks) {
    if (track._hasSubTracks && track._subTracks) {
      const parentArtist = trackArtistString(track.artists)
      for (const s of track._subTracks) {
        if (s._isSelectable === false) continue
        const t = cleanScrobbleTitle(s.title)
        out.push({ ...s, title: s._indexTitle ? `${cleanScrobbleTitle(s._indexTitle)} (${t})` : t, _artist: trackArtistString(s.artists) || parentArtist || artist, _album: album })
      }
    } else if (track._isSelectable) {
      out.push({ ...track, title: cleanScrobbleTitle(track.title), _artist: trackArtistString(track.artists) || artist, _album: album })
    }
  }
  return out
}
import TrackList from './TrackList'
import DiscSelector from './DiscSelector'
import ScrobbleButton from './ScrobbleButton'
import NfcButton from './NfcButton'
import ReleaseEditor from './ReleaseEditor'
import ScrobbleToast from './ScrobbleToast'

// Discogs vinyl "colour" words (in format.text / descriptions) → a display hex.
const VINYL_COLORS = {
  black: '#1a1a1a', red: '#d8392b', blue: '#2f6bd8', 'light blue': '#7fb3ff',
  green: '#2fa84f', yellow: '#e8c93a', orange: '#e87a2d', purple: '#8b3ce0',
  violet: '#8b3ce0', pink: '#e84d9a', magenta: '#e0309a', white: '#eaeaea',
  gold: '#d4af37', golden: '#d4af37', silver: '#c4c4c4', grey: '#8a8a8a',
  gray: '#8a8a8a', clear: '#cfe8ff', transparent: '#cfe8ff', amber: '#ff8c1a',
  turquoise: '#30d5c8', brown: '#7a4a2b', cream: '#f0e3c0', bone: '#f0e3c0',
}

// Pick a scrobble-toast disc style from the release formats.
function detectFormatInfo(formats = []) {
  const names = formats.map((f) => (f.name || '').toLowerCase())
  const extra = formats
    .flatMap((f) => [(f.text || ''), ...(f.descriptions || [])])
    .map((x) => x.toLowerCase())
  const all = [...names, ...extra].join(' ')

  let kind = 'cd'
  if (names.some((n) => n.includes('vinyl'))) kind = 'vinyl'
  else if (all.includes('sacd') || all.includes('super audio')) kind = 'sacd'
  else if (all.includes('blu-ray') || all.includes('bluray') || all.includes('blu ray')) kind = 'bluray'
  else if (names.some((n) => n.includes('dvd'))) kind = 'dvd'
  else if (names.some((n) => n.includes('cd'))) kind = 'cd'

  let color = null
  let translucent = false
  if (kind === 'vinyl') {
    const text = extra.join(' ')
    translucent = /transparent|translucent|\bclear\b/.test(text)
    // The actual hue — ignore the transparency markers (e.g. "Green Transparent"
    // should resolve to green, not to "clear"). Prefer multi-word matches first
    // (e.g. "light blue" before "blue").
    const hueKeys = Object.keys(VINYL_COLORS).filter((c) => c !== 'clear' && c !== 'transparent')
    const found = hueKeys.sort((a, b) => b.length - a.length).find((c) => text.includes(c))
    if (found) color = VINYL_COLORS[found]
    else if (translucent) color = '#cfe8ff' // clear vinyl with no stated hue
  }
  return { kind, color, translucent }
}

export default function AlbumDetail() {
  const { selectedAlbum, setSelectedAlbum, prefs, edits, saveReleaseEdits } = useApp()
  const [checkedTracks, setCheckedTracks] = useState(new Set())
  const [selectedDisc, setSelectedDisc] = useState(0)  // 0 = All Discs
  const [resolvedDurations, setResolvedDurations] = useState({}) // trackKey -> seconds (from MusicBrainz)
  const [editing, setEditing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState(null) // scrobble-success popup
  const { scrobbleState, scrobble, reset } = useLastfm()
  const { refreshRelease } = useDiscogs()

  // Re-fetch the release from Discogs (ignoring the local cache) to pick up
  // changes made to the release itself (new tracks, fixed titles/durations).
  const handleRefresh = useCallback(async () => {
    const id = selectedAlbum?.id
    if (!id || refreshing) return
    setRefreshing(true)
    try {
      await refreshRelease(id)
    } catch {
      // ignore — keep showing the cached release
    } finally {
      setRefreshing(false)
    }
  }, [selectedAlbum?.id, refreshing, refreshRelease])

  // Per-release edits (track/heading/disc names + per-release join toggle).
  const releaseEdits = edits?.[selectedAlbum?.id] || {}
  const titleEdits = releaseEdits.titles || {}

  // Reset selection when album changes
  useEffect(() => {
    setCheckedTracks(new Set())
    setSelectedDisc(0)
    setResolvedDurations({})
    setEditing(false)
    reset()
  }, [selectedAlbum?.id])

  const baseDiscGroups = useMemo(
    () => groupTracksByDisc(selectedAlbum?.tracklist ?? [], selectedAlbum),
    [selectedAlbum]
  )

  // Overlay MusicBrainz durations AND per-release title edits onto the grouped
  // tracks, so both the display and the scrobble payload pick them up.
  const discGroups = useMemo(() => {
    const hasDur = Object.keys(resolvedDurations).length > 0
    const hasTitles = Object.keys(titleEdits).length > 0
    if (!hasDur && !hasTitles) return baseDiscGroups

    const patchLeaf = (t) => {
      let nt = t
      const key = t.position || t.title
      if (t._durationSecs == null && resolvedDurations[key] != null) nt = { ...nt, _durationSecs: resolvedDurations[key] }
      if (titleEdits[key]) nt = { ...nt, title: titleEdits[key] }
      return nt
    }
    const out = {}
    for (const [disc, tracks] of Object.entries(baseDiscGroups)) {
      out[disc] = tracks.map((t) => {
        if (t._hasSubTracks && t._subTracks) {
          const parentKey = t.position || t.title
          const newParentTitle = titleEdits[parentKey] || t.title
          const subs = t._subTracks.map((s) => {
            let ns = patchLeaf(s)
            if (newParentTitle !== t.title && ns._indexTitle) ns = { ...ns, _indexTitle: newParentTitle }
            return ns
          })
          const total = subs.every((s) => s._durationSecs != null)
            ? subs.reduce((sum, s) => sum + s._durationSecs, 0)
            : null
          return { ...t, title: newParentTitle, _subTracks: subs, _totalDuration: total }
        }
        return patchLeaf(t)
      })
    }
    return out
  }, [baseDiscGroups, resolvedDurations, titleEdits])

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

    // Seed from the persisted cache synchronously → already-found times show
    // instantly on reload (no flicker, no re-fetch). Only query the network for
    // tracks not cached yet (undefined); known misses (null) are skipped.
    const seed = {}
    const toFetch = []
    for (const { key, title } of missing) {
      const cached = getCachedDuration({ artist: albumArtist, title, album: albumTitle })
      if (cached === undefined) toFetch.push({ key, title })
      else if (cached != null) seed[key] = cached
    }
    if (Object.keys(seed).length > 0) {
      setResolvedDurations((prev) => ({ ...prev, ...seed }))
    }
    if (toFetch.length === 0) return

    ;(async () => {
      for (const { key, title } of toFetch) {
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

  // Disc label rules:
  //  - exactly 1 section heading → that heading (e.g. "Essence", "HIStory Begins")
  //  - several headings → the FORMAT name ("SACD", "DVD", "Blu-ray"), because the
  //    headings are then content sections, not the disc title.
  //  - exception: when the format is generic ("CD" / none), use the TOP heading
  //    instead — e.g. the Dream Theater box, where each CD is a full album whose
  //    first heading ("Metropolis Pt.2…") is the real disc title.
  //  - no heading → the format name.
  const mergedDiscLabels = useMemo(() => {
    const result = {}
    for (const [key, tracks] of Object.entries(discGroups)) {
      const disc = Number(key)
      // Per-release manual disc name takes precedence (doesn't touch headings).
      // An explicit '' means the user cleared it → no label at all (just "Disc N").
      if (releaseEdits.discs?.[disc] !== undefined) {
        const manual = releaseEdits.discs[disc]
        if (manual) result[disc] = manual
        continue
      }
      // A disc that is a single top-level suite/section (an index/heading, even
      // with sub-tracks) takes that section's title — e.g. "Misplaced Childhood
      // Parts 1 & 2".
      if (tracks.length === 1 && (tracks[0]._isIndex || tracks[0]._isHeading) && tracks[0].title) {
        result[disc] = tracks[0].title
        continue
      }
      const headings = tracks.filter(
        (t) => (t._isIndex || t._isHeading) && !t._hasSubTracks
      )
      // Join all section headings with " | " when requested per-release, by the
      // hidden global pref, or for the Trilogy special case.
      if (
        (releaseEdits.joinHeadings || selectedAlbum?.id === 608601 || prefs?.joinDiscHeadings) &&
        headings.length > 1
      ) {
        result[disc] = headings.map((h) => h.title).join(' | ')
        continue
      }
      // A heading NAMES the disc only when the whole disc sits under it — i.e.
      // the disc STARTS with that heading (everything below belongs to it, e.g.
      // each disc of a box set is "<album>" then its tracks). A disc that starts
      // with a track has no name; the heading is then a mid-disc section.
      //
      // Named section headings that follow (song suites like "By-Tor", "Act II",
      // or "Bonus Tracks") are considered part of that album, so they don't block
      // naming. But an ANONYMOUS separator heading ("-", "—", blank) marks a break
      // to content OUTSIDE the lead heading — e.g. the encores after "The Dark
      // Side Of The Moon" on Pulse, or after the suites on Rush's live LP — so it
      // disqualifies the lead from naming the disc.
      // (Suites with their own sub-tracks already aren't counted as headings, so
      // a disc like Rush "Archives" — "Fly By Night" + the By-Tor suite — is
      // correctly named after its leading album heading.)
      const isHead = (t) => t && (t._isIndex || t._isHeading) && !t._hasSubTracks
      const firstIsHeading = isHead(tracks[0])
      const isSeparatorHeading = (t) => {
        const title = (t.title || '').trim()
        return title === '' || /^[-–—_.·•*~]+$/.test(title)
      }
      const otherHeadings = headings.filter((h) => h !== tracks[0])
      const leadWrapsDisc = firstIsHeading && !otherHeadings.some(isSeparatorHeading)
      const leadHeading = leadWrapsDisc ? tracks[0] : null
      const fmt = discLabels[disc]
      const label = leadHeading ? leadHeading.title : fmt
      if (label) result[disc] = label
    }
    return result
  }, [discGroups, discLabels, selectedAlbum, prefs?.joinDiscHeadings, releaseEdits])

  const artist = selectedAlbum?.artists
    ?.map((a) => a.name?.replace(/ \(\d+\)$/, ''))
    .join(', ') || ''
  // Album artist in the same format as per-track artists, to hide redundant
  // per-track credits in TrackItem.
  const albumArtistStr = trackArtistString(selectedAlbum?.artists)

  const artUrl = selectedAlbum?.images?.[0]?.uri || selectedAlbum?.images?.[0]?.resource_url

  // DVD / Blu-ray covers aren't square (they're the case art) — keep their aspect
  // ratio instead of cropping to a square.
  const isVideoFormat = (selectedAlbum?.formats || []).some((f) => /dvd|blu[- ]?ray/i.test(f.name || ''))

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

  const albumTitleClean = cleanScrobbleTitle(selectedAlbum?.title)

  // Per-disc scrobble album. In a box set ("Original Album Series", …) each disc
  // is a different album; the editor can mark a disc so its own name is used as
  // the album when scrobbling its tracks, instead of the box-set title.
  const albumByDisc = useMemo(() => {
    const m = {}
    for (const key of Object.keys(discGroups)) {
      const disc = Number(key)
      const useDiscName = releaseEdits.discAsAlbum?.[disc] && mergedDiscLabels[disc]
      m[disc] = useDiscName ? cleanScrobbleTitle(mergedDiscLabels[disc]) : albumTitleClean
    }
    return m
  }, [discGroups, releaseEdits, mergedDiscLabels, albumTitleClean])

  // Build a scrobble list across discs, baking the per-disc album into each track.
  const buildDiscsScrobble = useCallback(
    (discsObj) => {
      const out = []
      for (const key of Object.keys(discsObj).sort((a, b) => Number(a) - Number(b))) {
        out.push(...buildScrobbleList(discsObj[key], artist, albumByDisc[Number(key)] ?? albumTitleClean))
      }
      return out
    },
    [artist, albumByDisc, albumTitleClean]
  )

  // Tracks of the current view (a disc tab, or all discs) — the default scrobble.
  const currentDiscForScrobble = useMemo(() => {
    if (selectedDisc === 0) return buildDiscsScrobble(discGroups)
    return buildScrobbleList(currentDisc, artist, albumByDisc[selectedDisc] ?? albumTitleClean)
  }, [selectedDisc, discGroups, currentDisc, artist, albumByDisc, albumTitleClean, buildDiscsScrobble])

  // Checked tracks across all discs — the scrobble when something is selected.
  const selectedTracksForScrobble = useMemo(() => {
    const result = []
    for (const [key, disc] of Object.entries(discGroups)) {
      const discAlbum = albumByDisc[Number(key)] ?? albumTitleClean
      for (const track of disc) {
        if (track._hasSubTracks && track._subTracks) {
          const parentArtist = trackArtistString(track.artists)
          track._subTracks.forEach((s) => {
            if (s._isSelectable !== false && checkedTracks.has(trackKey(s))) {
              const t = cleanScrobbleTitle(s.title)
              result.push({ ...s, title: s._indexTitle ? `${cleanScrobbleTitle(s._indexTitle)} (${t})` : t, _artist: trackArtistString(s.artists) || parentArtist || artist, _album: discAlbum })
            }
          })
        } else if (track._isSelectable && checkedTracks.has(trackKey(track))) {
          result.push({ ...track, title: cleanScrobbleTitle(track.title), _artist: trackArtistString(track.artists) || artist, _album: discAlbum })
        }
      }
    }
    return result
  }, [checkedTracks, discGroups, artist, albumByDisc, albumTitleClean])

  const handleSaveEdits = useCallback(
    (draft) => {
      if (selectedAlbum?.id) saveReleaseEdits(selectedAlbum.id, draft)
      setEditing(false)
    },
    [selectedAlbum, saveReleaseEdits]
  )

  // Scrobble the selection if any track is checked, otherwise the current view.
  const handleScrobble = useCallback(() => {
    const tracks = checkedTracks.size > 0 ? selectedTracksForScrobble : currentDiscForScrobble
    scrobble(tracks, artist, albumTitleClean)
  }, [checkedTracks, selectedTracksForScrobble, currentDiscForScrobble, scrobble, artist, albumTitleClean])

  // Whole album (all discs) — for the header "Scrobble album" button.
  const allTracksForScrobble = useMemo(
    () => buildDiscsScrobble(discGroups),
    [discGroups, buildDiscsScrobble]
  )
  const handleScrobbleAll = useCallback(() => {
    scrobble(allTracksForScrobble, artist, albumTitleClean)
  }, [scrobble, allTracksForScrobble, artist, albumTitleClean])

  const scrobbleLabel =
    checkedTracks.size > 0
      ? `Scrobble ${checkedTracks.size} pista${checkedTracks.size !== 1 ? 's' : ''}`
      : `Scrobble ${selectedDisc === 0 ? 'álbum' : 'disco'}`

  // Format-dependent disc style for the success popup.
  const formatInfo = useMemo(() => detectFormatInfo(selectedAlbum?.formats), [selectedAlbum?.formats])

  // Clear the selection once a scrobble completes (success or partial), and
  // show the flashy success popup.
  useEffect(() => {
    if (scrobbleState.status === 'success' || scrobbleState.status === 'partial') {
      setCheckedTracks(new Set())
      setToast({
        id: Date.now(),
        kind: formatInfo.kind,
        color: formatInfo.color,
        translucent: formatInfo.translucent,
        count: scrobbleState.total,
        partial: scrobbleState.status === 'partial',
      })
    }
  }, [scrobbleState.status])

  if (!selectedAlbum) return null

  return (
    <div className="relative min-h-full overflow-hidden">
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
          onClick={() => {
            // Close directly (reliable in the native WKWebView, where history.back()
            // can reload the page instead of firing popstate). Also unwind the
            // history entry we pushed, without navigating, to keep the stack clean.
            setSelectedAlbum(null)
            if (window.history.state?.vinylAlbum) {
              window.history.replaceState({}, '', window.location.pathname)
            }
          }}
          className="md:hidden flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition-colors font-sans"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Collection
        </button>

        {/* Album header */}
        <div className="flex gap-4 items-start">
          {isVideoFormat && artUrl ? (
            // DVD / Blu-ray: keep aspect ratio (no square crop)
            <img
              src={artUrl}
              alt={selectedAlbum.title}
              className="shrink-0 w-28 h-auto rounded-xl object-contain shadow-2xl"
            />
          ) : (
            <div className="shrink-0 w-28 h-28 rounded-xl overflow-hidden shadow-2xl bg-border">
              {artUrl ? (
                <img src={artUrl} alt={selectedAlbum.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-3xl text-text-secondary opacity-30">◉</span>
                </div>
              )}
            </div>
          )}

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

        {/* Release editor */}
        {!selectedAlbum._loading && editing && (
          <ReleaseEditor
            baseDiscGroups={baseDiscGroups}
            discLabels={mergedDiscLabels}
            initialEdits={releaseEdits}
            onSave={handleSaveEdits}
            onCancel={() => setEditing(false)}
          />
        )}

        {/* Disc selector */}
        {!editing && !selectedAlbum._loading && discCount > 1 && (
          <DiscSelector
            discCount={discCount}
            selectedDisc={selectedDisc}
            onSelect={setSelectedDisc}
            onSelectDisc={handleSelectDisc}
            discLabels={mergedDiscLabels}
          />
        )}

        {/* Tracklist */}
        {!editing && !selectedAlbum._loading && currentDisc.length > 0 && (
          <div className="bg-card/60 md:bg-card/90 backdrop-blur-sm md:backdrop-blur-none rounded-xl p-4 border border-border/50">
            <TrackList
              tracks={currentDisc}
              checkedTracks={checkedTracks}
              onToggle={handleToggle}
              onGroupToggle={handleGroupToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onScrobble={handleScrobble}
              scrobbleLabel={scrobbleLabel}
              scrobbling={scrobbleState.status === 'loading'}
              albumArtist={albumArtistStr}
            />
          </div>
        )}

        {/* Scrobble status feedback (loading / success / error) */}
        {!editing && !selectedAlbum._loading && scrobbleState.status !== 'idle' && (
          <div className="pt-1">
            <ScrobbleButton
              checkedCount={checkedTracks.size}
              fallbackCount={currentDiscForScrobble.length}
              scrobbleState={scrobbleState}
              onScrobble={handleScrobble}
              onReset={reset}
            />
          </div>
        )}

        {/* Action bar */}
        {!editing && !selectedAlbum._loading && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {selectedAlbum.id && <NfcButton releaseId={selectedAlbum.id} />}
            {currentDisc.length > 0 && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white hover:border-accent/40 transition-all text-sm font-sans"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                Editar
              </button>
            )}
            {selectedAlbum.id && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Recargar el release desde Discogs"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white hover:border-accent/40 disabled:opacity-50 transition-all text-sm font-sans"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  <path d="M21 3v6h-6" />
                </svg>
                {refreshing ? 'Actualizando…' : 'Recargar'}
              </button>
            )}
          </div>
        )}

        {/* Convenience scrobble at the end — only for long tracklists (>23) */}
        {!editing && !selectedAlbum._loading && allSelectableKeys.length > 23 && (
          <button
            onClick={handleScrobble}
            disabled={scrobbleState.status === 'loading'}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent text-black font-sans font-medium text-sm hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            {scrobbleLabel}
          </button>
        )}

        {/* View on Discogs */}
        {!editing && !selectedAlbum._loading && selectedAlbum.id && (
          <a
            href={`https://www.discogs.com/release/${selectedAlbum.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3 mb-6 rounded-xl border border-border bg-card/60 hover:bg-card hover:border-accent/40 transition-all group"
          >
            <span className="flex items-center gap-2 text-sm font-sans text-text-secondary group-hover:text-white transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              Ver en Discogs
            </span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-secondary group-hover:text-accent transition-colors">
              <path d="M7 17L17 7M17 7H9M17 7v8" />
            </svg>
          </a>
        )}
      </div>

      {toast && (
        <ScrobbleToast
          key={toast.id}
          kind={toast.kind}
          color={toast.color}
          translucent={toast.translucent}
          count={toast.count}
          partial={toast.partial}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  )
}
