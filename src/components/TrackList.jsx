import { useMemo } from 'react'
import TrackItem from './TrackItem'
import RoundCheckbox from './RoundCheckbox'
import { formatDuration } from '../utils/tracklist'

// Collect the flat list of selectable leaf tracks within a section's track array.
function collectSelectables(sectionTracks) {
  const result = []
  for (const t of sectionTracks) {
    if (t._hasSubTracks && t._subTracks) t._subTracks.forEach((s) => result.push(s))
    else if (t._isSelectable) result.push(t)
  }
  return result
}

export default function TrackList({ tracks, checkedTracks, onToggle, onGroupToggle, onSelectAll, onDeselectAll, onScrobble, scrobbleLabel, scrobbling }) {
  // Selectable leaf keys across this disc — for the compact "select all" toggle.
  const selectableKeys = useMemo(() => {
    const keys = []
    for (const t of tracks) {
      if (t._hasSubTracks && t._subTracks) t._subTracks.forEach((s) => keys.push(s.position || s.title))
      else if (t._isSelectable) keys.push(t.position || t.title)
    }
    return keys
  }, [tracks])
  const allChecked = selectableKeys.length > 0 && selectableKeys.every((k) => checkedTracks.has(k))
  const someChecked = selectableKeys.some((k) => checkedTracks.has(k))

  const selectedDuration = useMemo(() => {
    let secs = 0
    for (const track of tracks) {
      if (track._hasSubTracks && track._subTracks) {
        for (const sub of track._subTracks) {
          if (checkedTracks.has(sub.position || sub.title)) secs += sub._durationSecs || 0
        }
      } else if (track._isSelectable && checkedTracks.has(track.position || track.title)) {
        secs += track._durationSecs || 0
      }
    }
    return secs
  }, [tracks, checkedTracks])

  // Split the flat track array into sections at every heading/index that has no sub_tracks.
  // These are "loose" headings like "Essence" or "The Hard Shoulder" that visually group
  // the tracks that follow them in the tracklist.
  const sections = useMemo(() => {
    const result = []
    let current = { heading: null, sectionTracks: [] }

    for (const track of tracks) {
      if ((track._isIndex || track._isHeading) && !track._hasSubTracks) {
        result.push(current)
        current = { heading: track, sectionTracks: [] }
      } else {
        current.sectionTracks.push(track)
      }
    }
    result.push(current)

    return result.filter((s) => s.heading || s.sectionTracks.length > 0)
  }, [tracks])

  return (
    <div className="space-y-1">
      {/* Header row — compact "select all" toggle (left) + scrobble (right) */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => (allChecked ? onDeselectAll() : onSelectAll())}
          className="flex items-center gap-2 group"
          title={allChecked ? 'Deseleccionar todo' : 'Seleccionar todo'}
        >
          <RoundCheckbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={() => (allChecked ? onDeselectAll() : onSelectAll())} />
          <span className="text-xs font-sans text-text-secondary group-hover:text-white transition-colors">Todas</span>
        </button>
        <div className="flex items-center gap-3">
          {selectedDuration > 0 && (
            <span className="font-mono text-xs text-text-secondary">{formatDuration(selectedDuration)}</span>
          )}
          {onScrobble && (
            <button
              onClick={onScrobble}
              disabled={scrobbling}
              className="flex items-center gap-1 text-xs font-sans font-medium text-accent hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              {scrobbleLabel}
            </button>
          )}
        </div>
      </div>

      {sections.map((section, si) => {
        const { heading, sectionTracks } = section

        // Selectable leaves for this section (used for heading toggle)
        const selectables = heading ? collectSelectables(sectionTracks) : []
        const sectionKeys = selectables.map((t) => t.position || t.title)
        const checkedCount = sectionKeys.filter((k) => checkedTracks.has(k)).length
        const allChecked = sectionKeys.length > 0 && checkedCount === sectionKeys.length
        const someChecked = checkedCount > 0
        const hasSelectables = sectionKeys.length > 0

        return (
          <div key={si} className={si > 0 ? 'mt-3' : ''}>
            {/* Section heading — clickable when it groups selectable tracks */}
            {heading && (
              <div
                onClick={hasSelectables ? () => onGroupToggle(selectables) : undefined}
                className={`group flex items-center gap-2 px-2 py-1.5 border-b border-border ${
                  heading._isIndex
                    ? 'text-xs font-sans font-medium text-accent uppercase tracking-wider'
                    : 'text-xs font-sans text-text-secondary italic'
                } ${hasSelectables ? 'cursor-pointer hover:bg-card-hover/50 rounded-t-sm transition-colors' : ''}`}
              >
                {/* Checkbox: hidden when unchecked, visible on hover or when section has selection */}
                {hasSelectables && (
                  <div className={`transition-opacity duration-150 shrink-0 ${
                    allChecked || someChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <RoundCheckbox
                      checked={allChecked}
                      indeterminate={someChecked && !allChecked}
                      onChange={() => onGroupToggle(selectables)}
                    />
                  </div>
                )}
                <span className="flex-1">{heading.title}</span>
              </div>
            )}

            {/* Tracks within this section */}
            {sectionTracks.map((track, ti) => {
              // Heading/index WITH sub_tracks (suites, movements)
              if ((track._isIndex || track._isHeading) && track._hasSubTracks && track._subTracks?.length > 0) {
                const subIds = track._subTracks.map((s) => s.position || s.title)
                const checkedSubs = subIds.filter((id) => checkedTracks.has(id))
                const subAllChecked = checkedSubs.length === subIds.length
                const subSomeChecked = checkedSubs.length > 0
                const totalDuration = track._subTracks.reduce((sum, s) => sum + (s._durationSecs || 0), 0)

                return (
                  <div key={ti} className="mt-2 first:mt-1">
                    <div
                      className="flex items-center gap-3 px-2 py-1.5 border-b border-border cursor-pointer hover:bg-card-hover rounded-t-md transition-colors"
                      onClick={() => onGroupToggle(track._subTracks)}
                    >
                      <RoundCheckbox
                        checked={subAllChecked}
                        indeterminate={subSomeChecked && !subAllChecked}
                        onChange={() => onGroupToggle(track._subTracks)}
                        size="lg"
                      />
                      <span className="text-xs font-sans font-medium text-accent uppercase tracking-wider flex-1">
                        {track.title}
                      </span>
                      {totalDuration > 0 && (
                        <span className="font-mono text-xs text-text-secondary">{formatDuration(totalDuration)}</span>
                      )}
                    </div>
                    <div className="subtrack-connector ml-4 mt-1 space-y-0.5 pb-1">
                      {track._subTracks.map((sub, si2) => (
                        <TrackItem
                          key={si2}
                          track={sub}
                          checked={checkedTracks.has(sub.position || sub.title)}
                          isSubTrack
                          onToggle={() => onToggle(sub)}
                        />
                      ))}
                    </div>
                  </div>
                )
              }

              // Normal track with sub_tracks
              if (track._hasSubTracks && track._subTracks) {
                const subIds = track._subTracks.map((s) => s.position || s.title)
                const checkedSubs = subIds.filter((id) => checkedTracks.has(id))
                const subAllChecked = checkedSubs.length === subIds.length
                const subSomeChecked = checkedSubs.length > 0

                return (
                  <div key={ti}>
                    <TrackItem
                      track={track}
                      checked={subAllChecked}
                      indeterminate={subSomeChecked && !subAllChecked}
                      onToggle={() => onGroupToggle(track._subTracks)}
                    />
                    <div className="subtrack-connector ml-4 mt-0.5 space-y-0.5 pb-1">
                      {track._subTracks.map((sub, si2) => (
                        <TrackItem
                          key={si2}
                          track={sub}
                          checked={checkedTracks.has(sub.position || sub.title)}
                          isSubTrack
                          onToggle={() => onToggle(sub)}
                        />
                      ))}
                    </div>
                  </div>
                )
              }

              // Plain track
              const trackId = track.position || track.title
              return (
                <TrackItem
                  key={ti}
                  track={track}
                  checked={checkedTracks.has(trackId)}
                  onToggle={() => onToggle(track)}
                />
              )
            })}
          </div>
        )
      })}

      {tracks.length === 0 && (
        <p className="text-text-secondary text-sm font-sans text-center py-8">No tracks on this disc.</p>
      )}
    </div>
  )
}
