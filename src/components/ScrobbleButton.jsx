import { useApp } from '../context/AppContext'

export default function ScrobbleButton({ checkedCount, scrobbleState, onScrobble, onReset }) {
  const { credentials } = useApp()
  const { status, progress, total, results, error } = scrobbleState

  if (status === 'success') {
    const profileUrl = `https://www.last.fm/user/${credentials.lastfmUsername}/library`
    return (
      <div className="flex items-center gap-3 success-pulse">
        <div className="flex items-center gap-2 bg-green-900/40 border border-green-700/50 text-green-400 px-4 py-2 rounded-lg text-sm font-sans">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Scrobbled {total} track{total !== 1 ? 's' : ''}
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline font-sans"
        >
          View on Last.fm →
        </a>
        <button onClick={onReset} className="text-xs text-text-secondary hover:text-white transition-colors">
          Done
        </button>
      </div>
    )
  }

  if (status === 'partial') {
    const failed = results.filter((r) => !r.accepted)
    const profileUrl = `https://www.last.fm/user/${credentials.lastfmUsername}/library`
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700/40 text-amber-400 px-4 py-2 rounded-lg text-sm font-sans">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {error}
          </div>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline font-sans">
            View on Last.fm →
          </a>
          <button onClick={onReset} className="text-xs text-text-secondary hover:text-white transition-colors">
            Dismiss
          </button>
        </div>
        {failed.length > 0 && (
          <ul className="text-xs text-text-secondary space-y-0.5 pl-1">
            {failed.slice(0, 5).map((r, i) => (
              <li key={i} className="font-mono">
                {r.track?.track} — {r.ignoredMessage}
              </li>
            ))}
            {failed.length > 5 && <li>…and {failed.length - 5} more</li>}
          </ul>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/40 text-red-400 px-4 py-2 rounded-lg text-sm font-sans">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
        <button
          onClick={onReset}
          className="text-xs text-accent hover:underline font-sans"
        >
          Retry
        </button>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-lg text-sm font-sans text-text-secondary">
          <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Scrobbling {progress}/{total}…
        </div>
      </div>
    )
  }

  // Idle state
  return (
    <button
      onClick={onScrobble}
      disabled={checkedCount === 0}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-sans font-medium text-sm transition-all ${
        checkedCount > 0
          ? 'bg-accent text-black hover:brightness-110 active:scale-95'
          : 'bg-card text-text-secondary cursor-not-allowed border border-border'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      {checkedCount > 0 ? `Scrobble ${checkedCount} track${checkedCount !== 1 ? 's' : ''}` : 'Select tracks to scrobble'}
    </button>
  )
}
