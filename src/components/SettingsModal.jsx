import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { getToken, getSession } from '../utils/lastfm'
import { useDiscogs } from '../hooks/useDiscogs'

export default function SettingsModal({ onClose }) {
  const { credentials, saveCredentials, hasCredentials, prefs, setPrefs } = useApp()
  const { loadCollection } = useDiscogs()

  const [form, setForm] = useState({ ...credentials })
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Web auth flow state: idle → getting-token → awaiting-user → getting-session → done
  const [authStep, setAuthStep] = useState('idle')
  const [pendingToken, setPendingToken] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [saving, setSaving] = useState(false)

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleGetToken() {
    if (!form.lastfmKey || !form.lastfmSecret) {
      setAuthError('Enter your Last.fm API Key and Secret first.')
      return
    }
    setAuthStep('getting-token')
    setAuthError(null)
    try {
      const token = await getToken(form.lastfmKey, form.lastfmSecret)
      setPendingToken(token)
      setAuthStep('awaiting-user')
      // Open Last.fm auth page in new tab
      window.open(`https://www.last.fm/api/auth/?api_key=${form.lastfmKey}&token=${token}`, '_blank')
    } catch (err) {
      setAuthError(err.message)
      setAuthStep('idle')
    }
  }

  async function handleGetSession() {
    if (!pendingToken) return
    setAuthStep('getting-session')
    setAuthError(null)
    try {
      const sessionKey = await getSession(pendingToken, form.lastfmKey, form.lastfmSecret)
      set('lastfmSessionKey', sessionKey)
      setAuthStep('done')
      setPendingToken(null)
    } catch (err) {
      setAuthError(err.message)
      setAuthStep('awaiting-user') // stay so user can retry
    }
  }

  function resetAuth() {
    setAuthStep('idle')
    setPendingToken(null)
    setAuthError(null)
  }

  async function handleSave() {
    setSaving(true)
    saveCredentials(form)
    await new Promise((r) => setTimeout(r, 100))
    setSaving(false)
    onClose()
    // Reload collection if Discogs creds are now set
    if (form.discogsToken && form.discogsUsername) {
      setTimeout(() => loadCollection(), 100)
    }
  }

  const inputClass =
    'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-text-secondary focus:outline-none focus:border-accent/60 transition-colors'
  const labelClass = 'block text-xs font-sans text-text-secondary mb-1.5 uppercase tracking-wide'

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl fade-in">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2
              className="font-serif text-xl text-white cursor-pointer select-none"
              onClick={() => setShowAdvanced((s) => !s)}
              title="Avanzado"
            >
              Settings
            </h2>
            {hasCredentials && (
              <button
                onClick={onClose}
                className="text-text-secondary hover:text-white transition-colors p-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Discogs section */}
          <section className="space-y-3">
            <h3 className="font-sans text-sm font-medium text-white flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
              Discogs
            </h3>
            <div>
              <label className={labelClass}>Username</label>
              <input
                type="text"
                className={inputClass}
                placeholder="your_username"
                value={form.discogsUsername}
                onChange={(e) => set('discogsUsername', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Personal Access Token</label>
              <input
                type="password"
                className={inputClass}
                placeholder="xxxxxxxxxxxxxxxxxxxxxx"
                value={form.discogsToken}
                onChange={(e) => set('discogsToken', e.target.value)}
              />
              <p className="text-xs text-text-secondary mt-1.5 font-sans">
                Get yours at{' '}
                <a
                  href="https://www.discogs.com/settings/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  discogs.com/settings/developers
                </a>
              </p>
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Last.fm section */}
          <section className="space-y-3">
            <h3 className="font-sans text-sm font-medium text-white flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              Last.fm
            </h3>
            <div>
              <label className={labelClass}>Username</label>
              <input
                type="text"
                className={inputClass}
                placeholder="your_lastfm_username"
                value={form.lastfmUsername}
                onChange={(e) => set('lastfmUsername', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>API Key</label>
                <input
                  type="password"
                  className={inputClass}
                  placeholder="API key"
                  value={form.lastfmKey}
                  onChange={(e) => set('lastfmKey', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>API Secret</label>
                <input
                  type="password"
                  className={inputClass}
                  placeholder="Secret"
                  value={form.lastfmSecret}
                  onChange={(e) => set('lastfmSecret', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-text-secondary font-sans">
              Create an API account at{' '}
              <a
                href="https://www.last.fm/api/account/create"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                last.fm/api/account/create
              </a>
            </p>

            {/* Web auth flow */}
            <div className="bg-background rounded-xl p-4 space-y-3 border border-border">
              <p className="text-xs text-text-secondary font-sans">
                Authorize the app on Last.fm to enable scrobbling — no password stored.
              </p>

              {/* Step 1 */}
              {authStep === 'idle' && (
                <button
                  onClick={handleGetToken}
                  className="w-full py-2.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-sans font-medium transition-colors"
                >
                  Step 1 — Authorize on Last.fm
                </button>
              )}

              {authStep === 'getting-token' && (
                <div className="flex items-center gap-2 text-sm text-text-secondary font-sans">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Requesting authorization token…
                </div>
              )}

              {authStep === 'awaiting-user' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-xs text-amber-400 font-sans bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    A Last.fm tab just opened. Click <strong>Allow access</strong>, then come back here and click below.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGetSession}
                      className="flex-1 py-2.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-sans font-medium transition-colors"
                    >
                      Step 2 — I've authorized, get session key
                    </button>
                    <button onClick={resetAuth} className="px-3 py-2.5 rounded-lg border border-border text-text-secondary hover:text-white text-sm font-sans transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {authStep === 'getting-session' && (
                <div className="flex items-center gap-2 text-sm text-text-secondary font-sans">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Exchanging token for session key…
                </div>
              )}

              {authStep === 'done' && (
                <p className="text-xs text-green-400 font-sans flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Authorized — session key saved. You can now scrobble.
                </p>
              )}

              {authError && (
                <div className="space-y-1">
                  <p className="text-xs text-red-400 font-sans">{authError}</p>
                  <button onClick={resetAuth} className="text-xs text-accent hover:underline font-sans">Try again</button>
                </div>
              )}

              {form.lastfmSessionKey && authStep === 'idle' && (
                <p className="text-xs text-text-secondary font-sans flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Session key saved — re-authorize only if scrobbling stops working
                </p>
              )}
            </div>
          </section>

          {/* Scrobbling preferences */}
          <section className="border-t border-border pt-4">
            <h3 className="font-sans text-sm font-medium text-white mb-3">Scrobbling</h3>
            <button
              onClick={() => setPrefs({ cleanScrobbleNames: !prefs?.cleanScrobbleNames })}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <span className="text-sm font-sans text-text-secondary pr-2">
                Limpiar nombres para coincidir con streaming
                <span className="block text-xs opacity-60 mt-0.5">
                  Quita etiquetas de reedición/remaster/edición de pistas y álbumes al scrobblear (p. ej. “Money (2011 Remaster)” → “Money”, “The Wall (Deluxe Edition)” → “The Wall”), para que Last.fm haga match con las versiones de streaming. Versiones como “(Live)” o “(Acoustic)” se mantienen.
                </span>
              </span>
              <span
                className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${
                  prefs?.cleanScrobbleNames ? 'bg-accent' : 'bg-border'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                    prefs?.cleanScrobbleNames ? 'translate-x-4' : ''
                  }`}
                />
              </span>
            </button>
          </section>

          {/* Advanced (hidden) — revealed by tapping the "Settings" title */}
          {showAdvanced && (
            <section className="border-t border-border pt-4">
              <h3 className="font-sans text-sm font-medium text-white mb-3">Avanzado</h3>
              <button
                onClick={() => setPrefs({ joinDiscHeadings: !prefs?.joinDiscHeadings })}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <span className="text-sm font-sans text-text-secondary pr-2">
                  Nombre del disco = todos sus headings
                  <span className="block text-xs opacity-60 mt-0.5">
                    Discos con varias secciones muestran los headings unidos (p. ej. “Pornography Set | Disintegration Set”).
                  </span>
                </span>
                <span
                  className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${
                    prefs?.joinDiscHeadings ? 'bg-accent' : 'bg-border'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      prefs?.joinDiscHeadings ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
              </button>
            </section>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-accent text-black font-sans font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
