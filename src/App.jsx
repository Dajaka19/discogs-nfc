import { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { useDiscogs } from './hooks/useDiscogs'
import CollectionGrid from './components/CollectionGrid'
import AlbumDetail from './components/AlbumDetail'
import SettingsModal from './components/SettingsModal'

function AppInner() {
  const { hasCredentials, selectedAlbum, settingsOpen, setSettingsOpen } = useApp()
  const { loadCollection, selectAlbum } = useDiscogs()

  useEffect(() => {
    if (!hasCredentials) return
    loadCollection()
    // If the app was opened via NFC tag (?release=ID), load that release immediately
    const releaseId = new URLSearchParams(window.location.search).get('release')
    if (releaseId) {
      selectAlbum({ id: releaseId })
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCredentials])

  return (
    <div className="flex flex-col bg-background" style={{ height: '100dvh' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-accent text-lg">◉</span>
          <h1 className="font-serif text-xl text-white tracking-tight">Vinyl</h1>
        </div>
        <div className="flex items-center gap-3">
          {hasCredentials && (
            <button
              onClick={loadCollection}
              title="Refresh collection"
              className="text-text-secondary hover:text-white transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="text-text-secondary hover:text-accent transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — collection grid */}
        <div
          className={`shrink-0 overflow-hidden flex flex-col md:w-[400px] lg:w-[440px] xl:w-[480px] border-r border-border ${
            selectedAlbum ? 'hidden md:flex' : 'flex w-full'
          }`}
        >
          <CollectionGrid />
        </div>

        {/* Right panel — album detail */}
        {selectedAlbum ? (
          <div className="flex-1 overflow-y-auto relative slide-in md:animate-none">
            <AlbumDetail />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="text-center space-y-3">
              <div className="text-7xl opacity-10">◉</div>
              <p className="font-sans text-sm text-text-secondary">Select a record</p>
            </div>
          </div>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
