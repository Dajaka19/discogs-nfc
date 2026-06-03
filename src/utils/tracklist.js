// Returns seconds, or null when the duration is missing/invalid.
// null = "unknown" → the UI shows no time and scrobbling omits the duration field.
export function parseDuration(str) {
  if (!str || typeof str !== 'string') return null
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

// Per-track artist credit (compilations / various-artists releases). Discogs puts
// the separator in each artist's `join` field. Returns "" when a track has no
// own artists (normal single-artist albums).
export function trackArtistString(artists) {
  if (!Array.isArray(artists) || artists.length === 0) return ''
  let out = ''
  artists.forEach((a, i) => {
    out += (a.name || '').replace(/ \(\d+\)$/, '')
    if (i < artists.length - 1) {
      // Normalize Discogs join separators to a clean Last.fm-friendly credit.
      const j = (a.join || '').trim()
      if (j === ',') out += ', '
      else if (/^feat\.?$|^featuring$/i.test(j)) out += ' feat. '
      else out += ' & ' // "&", verbose phrases ("Vocal Duet With", "With"…) or none
    }
  })
  return out.trim()
}

export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Returns 1-based disc number from a Discogs position string.
// Handles: "A1","B2" (side letter), "1-1","2-3" (disc-track), "CD1","CD2" etc.
export function getDiscNumber(position) {
  if (!position) return 1

  // "2-1" or "1-3" style (disc-track numbering)
  const dashMatch = position.match(/^(\d+)-\d/)
  if (dashMatch) return parseInt(dashMatch[1])

  // "CD1", "CD2" style
  const cdMatch = position.match(/^[A-Za-z]+(\d+)\./i)
  if (cdMatch) return parseInt(cdMatch[1])

  // Side letter: A,B = disc 1 ; C,D = disc 2 ; E,F = disc 3
  const letterMatch = position.match(/^([A-Fa-f])\d/i)
  if (letterMatch) {
    const idx = 'ABCDEF'.indexOf(letterMatch[1].toUpperCase())
    return Math.floor(idx / 2) + 1
  }

  return 1
}

// Returns the total number of physical discs across all format entries.
export function detectDiscCount(release) {
  const formats = release?.formats ?? []

  // Multi-format release (e.g. CD + Blu-ray): sum physical disc quantities only
  const physical = formats.filter(isPhysicalFormat)
  if (physical.length > 1) {
    const total = physical.reduce((sum, f) => sum + (parseInt(f.qty) || 1), 0)
    if (total > 1) return total
  }

  // Single format: check qty
  const qty = parseInt(physical[0]?.qty ?? formats[0]?.qty)
  if (qty > 1) return qty

  // Fall back to position-based detection
  const tracklist = release?.tracklist ?? []
  const positions = tracklist
    .filter((t) => t.type_ === 'track' && t.position)
    .map((t) => t.position)

  if (positions.length === 0) return 1

  const hasNumbered = positions.some((p) => /^\d+-\d/.test(p))
  if (hasNumbered) {
    const nums = positions.map((p) => parseInt(p.split('-')[0])).filter(Boolean)
    return Math.max(...nums, 1)
  }

  const letters = [...new Set(positions.map((p) => p.match(/^([A-Fa-f])/i)?.[1]?.toUpperCase()).filter(Boolean))]
  if (letters.length > 2) return Math.ceil(letters.length / 2)

  return 1
}

// Discogs format names that represent metadata or containers, not playable discs.
const NON_DISC_FORMATS = new Set(['all media', 'file', 'memo', 'box set'])

function isPhysicalFormat(fmt) {
  return !NON_DISC_FORMATS.has(fmt.name?.toLowerCase() ?? '')
}

// Returns a label for each disc number: { 1: "CD", 2: "Blu-ray" }
// Only populated when there are multiple distinct physical format entries.
export function getDiscLabels(release) {
  const formats = (release?.formats ?? []).filter(isPhysicalFormat)
  if (formats.length <= 1) return {}

  const labels = {}
  let disc = 1
  for (const fmt of formats) {
    const qty = parseInt(fmt.qty) || 1
    for (let i = 0; i < qty; i++) {
      labels[disc++] = fmt.name
    }
  }
  return labels
}

// Tracks whose POSITION is a label like "INTRO" (instead of a number) are
// interludes/intros that should never be scrobbled.
function isNonScrobblePosition(position) {
  return /^\s*intro\s*$/i.test(position || '')
}

function enrichTrack(track, disc) {
  const noScrobble = isNonScrobblePosition(track.position)
  return {
    ...track,
    _disc: disc,
    _durationSecs: parseDuration(track.duration),
    _isSelectable: track.type_ === 'track' && !noScrobble,
    _noScrobble: noScrobble,
    _isIndex: track.type_ === 'index',
    _isHeading: track.type_ === 'heading',
  }
}

function attachSubTracks(item, track, disc) {
  if (!track.sub_tracks?.length) return
  const indexTitle = item._isIndex || item._isHeading ? track.title : null
  item._subTracks = track.sub_tracks.map((s) => ({
    ...enrichTrack(s, disc),
    _isSelectable: !isNonScrobblePosition(s.position),
    _isSubTrack: true,
    _parentPosition: track.position,
    _indexTitle: indexTitle,
  }))
  // Only compute a total when EVERY sub-track has a known duration, otherwise
  // the sum would be misleading. Unknown → null (no time shown for the parent).
  item._totalDuration = item._subTracks.every((s) => s._durationSecs != null)
    ? item._subTracks.reduce((sum, s) => sum + s._durationSecs, 0)
    : null
  item._isSelectable = false
  item._hasSubTracks = true
}

// Normalize a format/heading string for fuzzy matching:
// lowercase, collapse hyphens/spaces to a single space.
function norm(str) {
  return str.toLowerCase().replace(/[-\s]+/g, ' ').trim()
}

// Heading-based disc detection for multi-format releases.
// A heading is a disc boundary when its title matches any physical format name
// (bidirectional: title⊇format OR format⊇title, after normalization).
// Returns a per-track array of { disc, isBoundary }, or null if no match found.
function tryHeadingBasedGrouping(tracklist, physicalFormats) {
  const fmtNames = physicalFormats.map((f) => norm(f.name))
  if (fmtNames.length === 0) return null

  let currentDisc = 0
  let anyMatch = false
  const map = []

  for (const track of tracklist) {
    if ((track.type_ === 'heading' || track.type_ === 'index') && track.title) {
      const t = norm(track.title)
      const isBoundary = fmtNames.some((n) => t.includes(n) || n.includes(t))
      if (isBoundary) {
        currentDisc++
        anyMatch = true
        map.push({ disc: currentDisc, isBoundary: true })
        continue
      }
    }
    // Tracks before the first format heading default to disc 1
    map.push({ disc: Math.max(currentDisc, 1), isBoundary: false })
  }

  return anyMatch ? map : null
}

// Extract the disc-unique identifier from a Discogs position string.
// Must be checked in this order (most-specific first):
//   CD1-1  → "CD1"  (FORMAT+DISCNUM-TRACKNUM: disc number is part of the id)
//   SACD-1 → "SACD" (FORMAT-TRACKNUM: no disc number before the hyphen)
//   BRD1   → "BRD"  (FORMATTRACKNUM: no separator at all)
// Single-letter positions (A1, B1…) are intentionally excluded by the {2,} minimum.
function extractDiscId(position) {
  if (!position) return null
  // FORMAT+DISCNUM-TRACKNUM: "CD1-1", "CD2-3", "BD1-1" → "CD1", "CD2", "BD1"
  const m1 = position.match(/^([A-Za-z]{2,}\d+)-\d/)
  if (m1) return m1[1].toUpperCase()
  // FORMAT-TRACKNUM: "SACD-1", "DVD-3", "BD-1" → "SACD", "DVD", "BD"
  const m3 = position.match(/^([A-Za-z]{2,})-\d/)
  if (m3) return m3[1].toUpperCase()
  // FORMATTRACKNUM: "BRD1", "CD1" (no disc sub-number) → "BRD", "CD"
  const m2 = position.match(/^([A-Za-z]{2,})\d/)
  if (m2) return m2[1].toUpperCase()
  return null
}

// Strategy D — multi-letter position prefix (BRD1, CD1-1, SACD-1, DVD-3…).
// Groups by unique disc identifier in first-appearance order; non-prefixed
// entries (headings, plain-number tracks) inherit the surrounding disc.
function tryPrefixBasedGrouping(tracklist) {
  const prefixOrder = []
  const seen = new Set()

  for (const t of tracklist) {
    if (!t.position) continue
    const id = extractDiscId(t.position)
    if (id && !seen.has(id)) { seen.add(id); prefixOrder.push(id) }
  }

  if (prefixOrder.length < 2) return null

  const prefixToDisc = Object.fromEntries(prefixOrder.map((p, i) => [p, i + 1]))

  // First pass: assign disc to prefix tracks, null to others
  const raw = tracklist.map((t) => {
    if (!t.position) return null
    const id = extractDiscId(t.position)
    return id ? (prefixToDisc[id] ?? null) : null
  })

  // Second pass: forward fill — headings inherit from the NEXT prefixed track.
  // This places inter-disc headings (e.g. "A Short Film" before DVD-1) on the
  // correct disc rather than the previous one.
  const filled = [...raw]
  let nextDisc = null
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i] !== null) nextDisc = raw[i]
    else if (nextDisc !== null) filled[i] = nextDisc
  }

  // Third pass: backward fill for any nulls that had no following prefixed track
  let lastDisc = 1
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] !== null) lastDisc = filled[i]
    else filled[i] = lastDisc
  }

  return filled
}

// Strategy B — numeric position resets (1,2,3,…1,2,3 = two discs).
function tryPositionResetGrouping(tracklist) {
  let currentDisc = 1
  let prevPos = 0
  let anyReset = false
  const map = []

  for (const track of tracklist) {
    const pos = parseInt(track.position)
    if (track.type_ === 'track' && pos === 1 && prevPos > 1) {
      currentDisc++
      anyReset = true
    }
    if (track.type_ === 'track' && !isNaN(pos) && pos > 0) prevPos = pos
    map.push(currentDisc)
  }

  return anyReset ? map : null
}

// Strategy C — if the count of top-level heading/index tracks exactly equals
// the expected physical disc count, treat them as ordered disc boundaries.
// Handles "Disc 1" / "Disc 2" headings that don't contain format names.
function tryCountMatchedHeadings(tracklist, physicalFormats) {
  const expected = physicalFormats.reduce((s, f) => s + (parseInt(f.qty) || 1), 0)
  if (expected <= 1) return null

  const headingIdxs = []
  for (let i = 0; i < tracklist.length; i++) {
    const t = tracklist[i]
    if ((t.type_ === 'heading' || t.type_ === 'index') && t.title) {
      const hasTracksAfter = tracklist.slice(i + 1).some((x) => x.type_ === 'track')
      if (hasTracksAfter) headingIdxs.push(i)
    }
  }

  if (headingIdxs.length !== expected) return null

  let currentDisc = 0
  let hi = 0
  return tracklist.map((_, i) => {
    if (hi < headingIdxs.length && i === headingIdxs[hi]) {
      currentDisc++
      hi++
      return { disc: currentDisc, isBoundary: true }
    }
    return { disc: Math.max(currentDisc, 1), isBoundary: false }
  })
}

function applyFlatMap(tracklist, map, discs) {
  tracklist.forEach((track, i) => {
    const disc = map[i]
    if (!discs[disc]) discs[disc] = []
    const item = enrichTrack(track, disc)
    attachSubTracks(item, track, disc)
    discs[disc].push(item)
  })
}

function applyBoundaryMap(tracklist, map, discs) {
  tracklist.forEach((track, i) => {
    const { disc, isBoundary } = map[i]
    if (isBoundary) return
    if (!discs[disc]) discs[disc] = []
    const item = enrichTrack(track, disc)
    attachSubTracks(item, track, disc)
    discs[disc].push(item)
  })
}

// Position-based grouping: side-letter (A/B→1, C/D→2) and N-M ("1-01", "2-3").
// Tracks without a position (headings, index rows) are forward-filled from the
// NEXT positioned track so they land on the correct disc — and crucially they
// are KEPT, so a disc-name heading ("El Mar No Cesa") stays as both a section
// divider and the source of the disc label.
function groupByPosition(tracklist) {
  const rawDiscs = tracklist.map((t) => (t.position ? getDiscNumber(t.position) : null))

  // Resolve blank-position entries (headings / index rows) run by run.
  let i = 0
  while (i < rawDiscs.length) {
    if (rawDiscs[i] !== null) {
      i++
      continue
    }
    // [i, j) is a maximal run of null (blank-position) entries
    let j = i
    while (j < rawDiscs.length && rawDiscs[j] === null) j++
    const prevDisc = i > 0 ? rawDiscs[i - 1] : null
    const nextDisc = j < rawDiscs.length ? rawDiscs[j] : null

    if (prevDisc === null) {
      // Run at the very start → belongs to the first disc
      for (let k = i; k < j; k++) rawDiscs[k] = nextDisc ?? 1
    } else if (nextDisc === null) {
      // Run at the very end → previous disc
      for (let k = i; k < j; k++) rawDiscs[k] = prevDisc
    } else if (nextDisc > prevDisc) {
      // Disc boundary. The album-intro heading (first `heading`) starts the next
      // disc; any leading `index`/orphan rows before it trail the previous disc.
      // e.g. Dream Theater box: "Trial Of Tears" (index, disc 3) sits before
      // "Metropolis Pt.2" (heading, disc 4) → keep it on disc 3.
      // Default split = i → everything forward (no heading found = lead-in run).
      // If a `heading` exists, split there: rows before it trail the prev disc.
      let split = i
      for (let k = i; k < j; k++) {
        if (tracklist[k].type_ === 'heading') { split = k; break }
      }
      for (let k = i; k < split; k++) rawDiscs[k] = prevDisc
      for (let k = split; k < j; k++) rawDiscs[k] = nextDisc
    } else {
      // Same disc (or a backward jump) → attach to the previous disc
      for (let k = i; k < j; k++) rawDiscs[k] = prevDisc
    }
    i = j
  }

  const discs = {}
  tracklist.forEach((track, idx) => {
    const disc = rawDiscs[idx]
    if (!discs[disc]) discs[disc] = []
    const item = enrichTrack(track, disc)
    attachSubTracks(item, track, disc)
    discs[disc].push(item)
  })
  return discs
}

// Group tracklist into discs. Accepts the full release object so it can
// detect multi-format releases and apply the right disc-separation strategy.
export function groupTracksByDisc(tracklist, release) {
  const formats = release?.formats ?? []
  const physicalFormats = formats.filter(isPhysicalFormat)

  // D: multi-letter position prefixes (BRD1, CD1-1, SACD-1, DVD-3…).
  // Runs first — purely data-driven, unambiguous when present.
  const prefixMap = tryPrefixBasedGrouping(tracklist)
  if (prefixMap) {
    const discs = {}
    applyFlatMap(tracklist, prefixMap, discs)
    if (Object.keys(discs).length > 1) return discs
  }

  // Position-based grouping (N-M, side letters). Preferred whenever the
  // positions already encode >1 disc — it keeps the disc-name headings, so they
  // become both section dividers and disc labels. Must run BEFORE the
  // heading-boundary strategies (A/C), which would otherwise CONSUME those
  // headings and leave generic "CD" labels (the bug on HIStory / Héroes box).
  const posDiscs = groupByPosition(tracklist)
  if (Object.keys(posDiscs).length > 1) return posDiscs

  if (physicalFormats.length > 1) {
    // A: heading/index tracks whose titles contain a physical format name
    const headingMap = tryHeadingBasedGrouping(tracklist, physicalFormats)
    if (headingMap) {
      const discs = {}
      applyBoundaryMap(tracklist, headingMap, discs)
      if (Object.keys(discs).length > 1) return discs
    }

    // B: numeric positions that restart from 1
    const resetMap = tryPositionResetGrouping(tracklist)
    if (resetMap) {
      const discs = {}
      applyFlatMap(tracklist, resetMap, discs)
      if (Object.keys(discs).length > 1) return discs
    }

    // C: heading count matches expected disc count ("Disc 1" / "Disc 2" style)
    const countMap = tryCountMatchedHeadings(tracklist, physicalFormats)
    if (countMap) {
      const discs = {}
      applyBoundaryMap(tracklist, countMap, discs)
      if (Object.keys(discs).length > 1) return discs
    }
  }

  // Single disc (or positions/headings gave no multi-disc signal)
  return posDiscs
}

// Build scrobble payload with timestamps calculated backwards from endTimeUnix.
export function buildScrobblePayload(selectedTracks, endTimeUnix) {
  const reversed = [...selectedTracks].reverse()
  let cursor = endTimeUnix
  const payload = []

  for (const track of reversed) {
    // 210s is used ONLY to space the timestamps when the real length is unknown.
    const spacing = track._durationSecs ?? 210
    cursor -= spacing
    payload.unshift({
      artist: track._artist || '',
      track: track.title || '',
      album: track._album || '',
      timestamp: cursor,
      // null when unknown → lastfm.js omits the duration field for this track
      duration: track._durationSecs ?? null,
      trackNumber: track.position || '',
    })
  }

  return payload
}
