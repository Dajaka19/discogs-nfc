import { formatDuration, trackArtistString } from '../utils/tracklist'
import RoundCheckbox from './RoundCheckbox'

// A single track row with checkbox, position, title, duration.
// Used for both normal tracks and sub-tracks (isSubTrack adds indent).
export default function TrackItem({ track, checked, indeterminate, onToggle, isSubTrack }) {
  const artistStr = trackArtistString(track.artists)
  // Show a time only when it's actually known (Discogs or a MusicBrainz lookup).
  // Unknown duration (_durationSecs == null) → render nothing.
  const duration = track._totalDuration
    ? formatDuration(track._totalDuration)
    : track._durationSecs
    ? formatDuration(track._durationSecs)
    : ''

  // INTRO-style tracks: shown but never scrobblable — no checkbox, dimmed, inert.
  if (track._noScrobble) {
    return (
      <div className="flex items-center gap-3 py-1.5 px-2 rounded-md opacity-50">
        <span className="w-4 shrink-0" />
        {track.position && (
          <span className="font-mono text-xs text-text-secondary shrink-0 leading-none whitespace-nowrap min-w-[3.5rem]">
            {track.position}
          </span>
        )}
        <span className="font-sans text-sm text-text-secondary flex-1 leading-snug italic">
          {track.title}
        </span>
        {duration && (
          <span className="font-mono text-xs text-text-secondary shrink-0 leading-none">{duration}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-card-hover transition-colors cursor-pointer"
      onClick={() => onToggle(track)}
    >
      <RoundCheckbox checked={checked} indeterminate={indeterminate} onChange={() => onToggle(track)} />

      {track.position && (
        <span className="font-mono text-xs text-accent shrink-0 leading-none whitespace-nowrap min-w-[3.5rem]">
          {track.position}
        </span>
      )}

      <span className="font-sans text-sm text-white flex-1 leading-snug">
        {artistStr && <span className="text-text-secondary">{artistStr} – </span>}
        {track.title}
        {track._hasSubTracks && (
          <span className="ml-1.5 text-xs text-text-secondary font-sans">
            ({track._subTracks?.length} parts)
          </span>
        )}
      </span>

      {duration && (
        <span className="font-mono text-xs text-text-secondary shrink-0 leading-none">
          {duration}
        </span>
      )}
    </div>
  )
}
