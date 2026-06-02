import { useState } from 'react'

// NFC tag writing on iOS — approach rationale:
//
//   Web NFC API (NDEFReader): Android Chrome only, not supported on iOS Safari. Rejected.
//   nfctools://write/url?value=…: NFC Tools URL scheme — unreliable on iOS;
//     the scheme is not consistently registered even when the app is installed. Rejected.
//   iOS Shortcuts (shortcuts://run-shortcut?name=…): built into every iPhone running
//     iOS 14+, no third-party app required. The "Write NFC Tag" Shortcut action is a
//     native Apple API. User sets up the shortcut once; after that, tapping the button
//     opens Shortcuts pre-loaded with the release URL and prompts "Hold near tag". Selected.
//   Clipboard fallback: always available for any other NFC writer.
//
// One-time Shortcuts setup (shown in the info panel below):
//   1. Open the Shortcuts app → tap +
//   2. Add action "Write NFC Tag"  (search for "NFC")
//   3. Tap the URL field → choose "Shortcut Input"
//   4. Rename the shortcut to exactly: Write NFC
//   5. Done — never needed again.
//
// Payload written to the tag: https://discogs-nfc.vercel.app?release={id}
// When scanned, the vinyl app opens and auto-loads the release.
const APP_BASE = 'https://discogs-nfc.vercel.app'
const SHORTCUT_NAME = 'Write NFC'

export default function NfcButton({ releaseId }) {
  const [copied, setCopied] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  const tagUrl = `${APP_BASE}?release=${releaseId}`
  const shortcutsUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(tagUrl)}`

  const handleNfc = () => {
    window.location.href = shortcutsUrl
    // Clipboard fallback: if Shortcuts didn't intercept (desktop, not set up yet),
    // copy the URL after a short delay.
    setTimeout(() => {
      navigator.clipboard?.writeText(tagUrl).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
    }, 800)
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(tagUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Primary: iOS Shortcuts */}
        <button
          onClick={handleNfc}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white hover:border-accent/40 transition-all text-sm font-sans"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          Write NFC
        </button>

        {/* Clipboard fallback */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white transition-all text-sm font-sans"
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy URL
            </>
          )}
        </button>

        {/* Setup toggle */}
        <button
          onClick={() => setShowSetup((s) => !s)}
          title="First time setup"
          className="w-7 h-7 flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-white hover:border-accent/40 transition-all text-xs font-mono"
        >
          ?
        </button>
      </div>

      {/* One-time setup instructions */}
      {showSetup && (
        <div className="bg-card/80 border border-border rounded-xl p-3 text-xs font-sans text-text-secondary space-y-1.5 fade-in">
          <p className="text-white font-medium">First-time setup (once only):</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Open the <span className="text-white">Shortcuts</span> app → tap <span className="text-white">+</span></li>
            <li>Add action <span className="text-white">"Write NFC Tag"</span> (search "NFC")</li>
            <li>Tap the URL field → choose <span className="text-white">"Shortcut Input"</span></li>
            <li>Name the shortcut exactly: <span className="text-accent font-mono">Write NFC</span></li>
          </ol>
          <p className="opacity-60 pt-0.5">After setup, tap "Write NFC" → hold iPhone to tag → done.</p>
        </div>
      )}
    </div>
  )
}
