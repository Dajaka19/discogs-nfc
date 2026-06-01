import { useState } from 'react'

// NFC tag writing approach: NFC Tools URL scheme (nfctools://write/url?value=...)
//
// Evaluated options:
//   Web NFC API (NDEFReader): Android Chrome only — not supported on iOS Safari. Rejected.
//   iOS Shortcuts URL scheme: requires user to create a Shortcut first. Too many steps. Rejected.
//   nfchelper:// URL scheme: obscure app, small user base. Rejected.
//   nfctools://write/url?value=: Works on iOS + Android if NFC Tools app installed.
//     Flow: tap button → NFC Tools opens pre-filled → hold to tag → done (2 steps). Selected.
//   Clipboard fallback: always works, user pastes into their NFC app manually.
//
// Payload: https://www.discogs.com/release/{id} — standard NDEF URI record.
// When scanned, any phone opens the Discogs release page directly.

export default function NfcButton({ releaseId }) {
  const [copied, setCopied] = useState(false)
  const [nfcAttempted, setNfcAttempted] = useState(false)

  const url = `https://www.discogs.com/release/${releaseId}`
  const nfcToolsUrl = `nfctools://write/url?value=${encodeURIComponent(url)}`

  const handleNfc = () => {
    setNfcAttempted(true)
    window.location.href = nfcToolsUrl

    // After 600ms, if the app didn't intercept (desktop or app not installed),
    // copy to clipboard as fallback
    setTimeout(() => {
      navigator.clipboard?.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
    }, 600)
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleNfc}
        title="Requires NFC Tools app (iOS App Store / Google Play)"
        className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-card text-text-secondary hover:text-white hover:border-accent/40 transition-all text-sm font-sans"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        Write NFC
      </button>

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
    </div>
  )
}
