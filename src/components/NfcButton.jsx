import { useState } from 'react'

// NFC tag writing on iOS — the honest reality:
//
//   Web NFC API (NDEFReader): Android Chrome only, NOT iOS Safari.
//   iOS Shortcuts: can only READ NFC tags as automation triggers — there is NO
//     "Write NFC Tag" action. Writing via Shortcuts is impossible. Rejected.
//   nfctools:// URL scheme: not reliably registered on iOS ("cannot open"). Rejected.
//
// Conclusion: on iOS, writing an NFC tag requires a third-party writer app
// (NFC Tools, free) and there is no dependable deep-link into its write screen.
// The robust, always-working flow is therefore:
//     Copy URL  →  open NFC Tools  →  Write → Add a record → URL → paste → Write.
//
// Payload written to the tag: https://discogs-nfc.vercel.app?release={id}
// When the tag is later scanned, the app opens and auto-loads the release.
const APP_BASE = 'https://discogs-nfc.vercel.app'

export default function NfcButton({ releaseId }) {
  const [copied, setCopied] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const tagUrl = `${APP_BASE}?release=${releaseId}`

  const handleCopy = () => {
    navigator.clipboard?.writeText(tagUrl).then(() => {
      setCopied(true)
      setShowHelp(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Copy the tag URL — the dependable first step */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white hover:border-accent/40 transition-all text-sm font-sans"
        >
          {copied ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              URL copied
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              Copy NFC URL
            </>
          )}
        </button>

        {/* How-to toggle */}
        <button
          onClick={() => setShowHelp((s) => !s)}
          title="How to write the tag"
          className="w-7 h-7 flex items-center justify-center rounded-full border border-border text-text-secondary hover:text-white hover:border-accent/40 transition-all text-xs font-mono"
        >
          ?
        </button>
      </div>

      {/* NFC Tools write instructions */}
      {showHelp && (
        <div className="bg-card/80 border border-border rounded-xl p-3 text-xs font-sans text-text-secondary space-y-1.5 fade-in max-w-sm">
          <p className="text-white font-medium">Write this tag with NFC Tools (free):</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Tap <span className="text-white">Copy NFC URL</span> above</li>
            <li>Open <span className="text-white">NFC Tools</span> → <span className="text-white">Write</span> tab</li>
            <li>Tap <span className="text-white">Add a record</span> → <span className="text-white">URL/URI</span></li>
            <li>Paste the URL → <span className="text-white">OK</span></li>
            <li>Tap <span className="text-white">Write</span> → hold iPhone to the tag</li>
          </ol>
          <p className="opacity-60 pt-0.5">
            iOS can't write tags from Safari or Shortcuts — a writer app like NFC Tools is required. Once written,
            scanning the tag opens this app at the release automatically.
          </p>
        </div>
      )}
    </div>
  )
}
