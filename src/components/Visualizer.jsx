import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../context/AppContext'
import { fetchLyrics } from '../utils/lyrics'
import { formatDuration } from '../utils/tracklist'
import {
  DISPLAY_SOURCE,
  closeAudio,
  createAnalyser,
  ensureAudioPermission,
  hasAudioPermission,
  listAudioInputs,
  onDeviceChange,
  openInputStream,
  readLevel,
} from '../utils/audioInputs'

// Full-screen "now playing" view (desktop only): cover art + metadata on the
// left, synced lyrics on the right, driven by whatever the PC is playing.
//
// SYNC MODEL — a browser cannot derive a playback POSITION from audio (that needs
// Shazam-style fingerprinting), so the captured audio acts as a TRANSPORT:
//   armed   → the clock starts at 0 on the first sound (put the needle down)
//   running → the clock advances; sustained silence can auto-pause it
// and the user can always re-sync by hand ("S"), nudge the offset, or click a
// lyric line to jump the clock there.
//
// PERFORMANCE — the clock/level update every animation frame, so they live in
// refs and are written straight to the DOM (canvas, textContent, a CSS custom
// property). React only re-renders when the ACTIVE LYRIC LINE changes, which is
// a few times a minute instead of 60x a second.
const ONSET_RMS = 0.02 // sound above this starts an armed clock
const SILENCE_RMS = 0.008 // below this counts as silence (hysteresis vs ONSET)
const SILENCE_PAUSE_MS = 4000 // silence this long auto-pauses the clock
const AUTOSCROLL_RESUME_MS = 6000 // after a manual scroll, wait before re-centring

export default function Visualizer({ tracks, index, onIndex, album, artist, artUrl, accent, onClose }) {
  const { prefs, setPrefs } = useApp()
  const track = tracks[index]

  const [lyrics, setLyrics] = useState(null) // null = loading
  const [activeIdx, setActiveIdx] = useState(-1)
  const [status, setStatus] = useState('idle') // idle | armed | running | paused
  const [offset, setOffset] = useState(0)
  const [inputs, setInputs] = useState([])
  const [permission, setPermission] = useState(false)
  const [listening, setListening] = useState(false)
  const [audioError, setAudioError] = useState(null)
  const [autoPause, setAutoPause] = useState(true)

  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const clockElRef = useRef(null)
  const meterElRef = useRef(null)
  const scrollerRef = useRef(null)
  const lineRefs = useRef([])

  const audioRef = useRef(null)
  const clockRef = useRef({ pos: 0, last: 0, running: false })
  const statusRef = useRef('idle')
  const offsetRef = useRef(0)
  const syncedRef = useRef([])
  const activeRef = useRef(-1)
  const silenceSince = useRef(null)
  const autoPauseRef = useRef(true)
  const userScrolledAt = useRef(0)

  const selectedInput = prefs?.visualizerInputId || ''
  const trackArtist = track?._artist || artist
  const duration = track?._durationSecs || track?._totalDuration || null
  const accentColor = accent || '#f5a623'

  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { offsetRef.current = offset }, [offset])
  useEffect(() => { autoPauseRef.current = autoPause }, [autoPause])

  const setStatusBoth = useCallback((s) => {
    statusRef.current = s
    clockRef.current.running = s === 'running'
    setStatus(s)
  }, [])

  // ---- lyrics -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLyrics(null)
    setActiveIdx(-1)
    activeRef.current = -1
    syncedRef.current = []
    if (!track) return
    fetchLyrics({ artist: trackArtist, track: track.title, album, duration }).then((r) => {
      if (cancelled) return
      setLyrics(r)
      syncedRef.current = r.synced || []
    })
    return () => {
      cancelled = true
    }
  }, [track?.title, trackArtist, album, duration])

  // New track → clock back to zero, waiting to be re-armed.
  useEffect(() => {
    clockRef.current.pos = 0
    setOffset(0)
    setStatusBoth(listening ? 'armed' : 'idle')
    lineRefs.current = []
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- audio devices ------------------------------------------------------
  const refreshInputs = useCallback(async () => {
    const granted = await hasAudioPermission()
    setPermission(granted)
    setInputs(await listAudioInputs())
  }, [])

  useEffect(() => {
    refreshInputs()
    return onDeviceChange(refreshInputs)
  }, [refreshInputs])

  const grantPermission = async () => {
    setAudioError(null)
    const ok = await ensureAudioPermission()
    if (!ok) setAudioError('Permiso denegado. Actívalo en el candado de la barra de direcciones.')
    await refreshInputs()
  }

  const stopListening = useCallback(() => {
    closeAudio(audioRef.current)
    audioRef.current = null
    setListening(false)
    if (meterElRef.current) meterElRef.current.style.transform = 'scaleX(0)'
    rootRef.current?.style.setProperty('--glow', '0')
  }, [])

  const startListening = useCallback(
    async (deviceId) => {
      setAudioError(null)
      try {
        closeAudio(audioRef.current)
        audioRef.current = null
        const stream = await openInputStream(deviceId)
        audioRef.current = createAnalyser(stream)
        setListening(true)
        // Listening implies we're waiting for the track to start.
        clockRef.current.pos = 0
        setStatusBoth('armed')
        if (!permission) refreshInputs()
      } catch (err) {
        setAudioError(err?.message || 'No se pudo capturar el audio')
        setListening(false)
      }
    },
    [permission, refreshInputs, setStatusBoth]
  )

  useEffect(() => () => closeAudio(audioRef.current), []) // unmount cleanup

  const chooseInput = (deviceId) => {
    setPrefs({ visualizerInputId: deviceId })
    if (deviceId) startListening(deviceId)
    else stopListening()
  }

  // ---- the loop: clock, level, spectrum, active line ----------------------
  useEffect(() => {
    let raf
    const tick = () => {
      const now = performance.now()
      const c = clockRef.current

      if (c.running) c.pos += (now - (c.last || now)) / 1000
      c.last = now

      const a = audioRef.current
      if (a) {
        const rms = readLevel(a)
        const glow = Math.min(1, rms * 6)
        rootRef.current?.style.setProperty('--glow', glow.toFixed(3))
        if (meterElRef.current) meterElRef.current.style.transform = `scaleX(${Math.min(1, rms * 4).toFixed(3)})`

        if (rms > ONSET_RMS) {
          silenceSince.current = null
          if (statusRef.current === 'armed') {
            c.pos = 0
            setStatusBoth('running')
          } else if (statusRef.current === 'paused') {
            setStatusBoth('running')
          }
        } else if (rms < SILENCE_RMS && statusRef.current === 'running' && autoPauseRef.current) {
          if (silenceSince.current == null) silenceSince.current = now
          else if (now - silenceSince.current > SILENCE_PAUSE_MS) {
            silenceSince.current = null
            setStatusBoth('paused')
          }
        }

        a.analyser.getByteFrequencyData(a.freqBuf)
        drawSpectrum(canvasRef.current, a.freqBuf, accentColor)
      }

      // clock readout — written directly, no re-render
      const pos = c.pos + offsetRef.current
      if (clockElRef.current) clockElRef.current.textContent = clockText(pos)

      // active lyric line — the ONLY thing that triggers a React update
      const synced = syncedRef.current
      if (synced.length) {
        let lo = 0
        let hi = synced.length - 1
        let res = -1
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (synced[mid].time <= pos) {
            res = mid
            lo = mid + 1
          } else hi = mid - 1
        }
        if (res !== activeRef.current) {
          activeRef.current = res
          setActiveIdx(res)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [accentColor, setStatusBoth])

  // ---- lyric auto-scroll (yields to manual scrolling) ---------------------
  useEffect(() => {
    if (activeIdx < 0) return
    if (performance.now() - userScrolledAt.current < AUTOSCROLL_RESUME_MS) return
    const el = lineRefs.current[activeIdx]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx])

  // ---- transport ----------------------------------------------------------
  const seek = useCallback((secs) => {
    clockRef.current.pos = Math.max(0, secs)
    if (clockElRef.current) clockElRef.current.textContent = clockText(clockRef.current.pos + offsetRef.current)
  }, [])

  const resyncNow = useCallback(() => {
    seek(0)
    setStatusBoth('running')
  }, [seek, setStatusBoth])

  const armSync = useCallback(() => {
    seek(0)
    setStatusBoth('armed')
  }, [seek, setStatusBoth])

  const togglePlay = useCallback(() => {
    setStatusBoth(statusRef.current === 'running' ? 'paused' : 'running')
  }, [setStatusBoth])

  // ---- keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 's' || e.key === 'S') resyncNow()
      else if (e.key === 'ArrowLeft') setOffset((o) => Math.round((o - 0.25) * 100) / 100)
      else if (e.key === 'ArrowRight') setOffset((o) => Math.round((o + 0.25) * 100) / 100)
      else if (e.key === 'ArrowDown' && index < tracks.length - 1) onIndex(index + 1)
      else if (e.key === 'ArrowUp' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onIndex, index, tracks.length, togglePlay, resyncNow])

  const synced = lyrics?.synced || []
  // Rendered lyric nodes only rebuild when the lines or the active index change.
  const lyricNodes = useMemo(
    () =>
      synced.map((line, i) => {
        const active = i === activeIdx
        const past = i < activeIdx
        return (
          <p
            key={i}
            ref={(el) => (lineRefs.current[i] = el)}
            onClick={() => seek(Math.max(0, line.time - offsetRef.current))}
            className={`origin-left cursor-pointer transition-all duration-500 ${
              active
                ? 'text-white scale-[1.02]'
                : past
                ? 'text-white/25 hover:text-white/40'
                : 'text-white/45 hover:text-white/70'
            }`}
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: active ? '2.9rem' : '2.1rem',
              lineHeight: 1.25,
              margin: active ? '1.5rem 0' : '1.1rem 0',
              textShadow: active ? '0 0 34px rgba(255,255,255,0.28)' : 'none',
            }}
          >
            {line.text || '♪'}
          </p>
        )
      }),
    [synced, activeIdx, seek]
  )

  if (!track) return null

  const statusChip = {
    idle: { text: 'Sin sincronizar', cls: 'bg-white/10 text-white/60 border-white/15' },
    armed: { text: 'Esperando al inicio…', cls: 'bg-amber-400/15 text-amber-300 border-amber-400/40 animate-pulse' },
    running: { text: 'Sincronizado', cls: 'bg-green-500/15 text-green-300 border-green-400/40' },
    paused: { text: 'En pausa (silencio)', cls: 'bg-white/10 text-white/60 border-white/20' },
  }[status]

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[70] text-white overflow-hidden select-none"
      style={{ '--glow': 0, background: '#07070a' }}
    >
      {/* reactive blurred backdrop (driven by --glow, no React re-render) */}
      {artUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${artUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(100px) saturate(1.7) brightness(calc(0.26 + var(--glow) * 0.2))',
            transform: 'scale(calc(1.2 + var(--glow) * 0.05))',
            willChange: 'transform, filter',
          }}
        />
      )}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-black/55 via-black/20 to-black/75" />

      <button
        onClick={onClose}
        title="Cerrar (Esc)"
        className="absolute top-6 right-7 z-30 w-9 h-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="relative z-10 h-full grid grid-cols-[400px_1fr] xl:grid-cols-[440px_1fr]">
        {/* ============ LEFT: art, metadata, transport, input ============ */}
        <aside className="h-full overflow-y-auto no-bar px-9 py-10 flex flex-col gap-6 border-r border-white/10 bg-black/25 backdrop-blur-xl">
          {artUrl && (
            <img
              src={artUrl}
              alt=""
              className="w-full aspect-square object-cover rounded-2xl"
              style={{
                boxShadow: `0 24px 70px rgba(0,0,0,0.65), 0 0 calc(30px + var(--glow) * 90px) ${accentColor}44`,
                willChange: 'box-shadow',
              }}
            />
          )}

          <div>
            <h1 className="font-serif text-[2.1rem] leading-[1.15]">{track.title}</h1>
            <p className="font-sans text-base text-white/70 mt-1.5">{trackArtist}</p>
            <p className="font-sans text-sm text-white/40">{album}</p>
          </div>

          <canvas ref={canvasRef} width={800} height={72} className="w-full h-[52px]" />

          {/* transport */}
          <div className="flex items-center gap-2.5">
            <IconBtn onClick={() => index > 0 && onIndex(index - 1)} disabled={index === 0} title="Anterior (↑)">
              <path d="M19 20 9 12l10-8v16zM5 19V5h2v14H5z" />
            </IconBtn>
            <button
              onClick={togglePlay}
              title="Reproducir/Pausar (Espacio)"
              className="w-12 h-12 shrink-0 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                {status === 'running' ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
              </svg>
            </button>
            <IconBtn
              onClick={() => index < tracks.length - 1 && onIndex(index + 1)}
              disabled={index >= tracks.length - 1}
              title="Siguiente (↓)"
            >
              <path d="M5 4l10 8-10 8V4zM17 5h2v14h-2z" />
            </IconBtn>
            <span className="ml-auto font-mono text-sm text-white/70 tabular-nums">
              <span ref={clockElRef}>0:00</span>
              {duration ? <span className="text-white/35"> / {formatDuration(duration)}</span> : null}
            </span>
          </div>

          {/* sync */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/45 font-sans">Sincronía</span>
              <span className={`text-[11px] font-sans px-2 py-0.5 rounded-full border ${statusChip.cls}`}>
                {statusChip.text}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={armSync}
                title="Poner a cero y arrancar cuando empiece a sonar"
                className="flex-1 px-3 py-2 rounded-lg text-sm font-sans bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
              >
                Esperar al inicio
              </button>
              <button
                onClick={resyncNow}
                title="La canción ya suena: empezar la letra ahora (S)"
                className="flex-1 px-3 py-2 rounded-lg text-sm font-sans bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
              >
                Sincronizar ahora
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/45 font-sans">Ajuste</span>
              <button onClick={() => setOffset((o) => Math.round((o - 0.25) * 100) / 100)} className={nudgeCls} title="Letra antes (←)">
                −
              </button>
              <span className="font-mono text-xs text-white/70 w-16 text-center tabular-nums">
                {offset >= 0 ? '+' : ''}
                {offset.toFixed(2)}s
              </span>
              <button onClick={() => setOffset((o) => Math.round((o + 0.25) * 100) / 100)} className={nudgeCls} title="Letra después (→)">
                +
              </button>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-white/45 font-sans cursor-pointer" title="Pausar la letra tras 4s de silencio">
                <input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} />
                Auto-pausa
              </label>
            </div>
          </div>

          {/* audio input */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/45 font-sans">Entrada de audio</span>
              {listening && <span className="text-[11px] text-green-300 font-sans">● escuchando</span>}
            </div>

            {!permission && (
              <button
                onClick={grantPermission}
                className="w-full px-3 py-2 rounded-lg text-sm font-sans bg-accent/90 text-black hover:brightness-110 transition-all"
              >
                Permitir micrófono para ver las entradas
              </button>
            )}

            <select
              value={selectedInput}
              onChange={(e) => chooseInput(e.target.value)}
              className="w-full bg-[#15151b] border border-white/15 rounded-lg px-2.5 py-2 text-sm font-sans text-white outline-none focus:border-accent/60 transition-colors"
            >
              <option value="">— Elegir entrada —</option>
              {inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
              <option value={DISPLAY_SOURCE}>Pestaña / pantalla del navegador…</option>
            </select>

            {/* live level meter — confirms the chosen input is the right one */}
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                ref={meterElRef}
                className="h-full w-full origin-left rounded-full"
                style={{ transform: 'scaleX(0)', background: accentColor, willChange: 'transform' }}
              />
            </div>

            {listening && (
              <button onClick={stopListening} className="text-xs text-white/45 hover:text-white font-sans transition-colors">
                Detener escucha
              </button>
            )}
            {audioError && <p className="text-xs text-red-400 font-sans">{audioError}</p>}
            <p className="text-[11px] text-white/30 font-sans leading-relaxed">
              Para oír lo que suena en el PC elige <strong>Mezcla estéreo</strong> (actívala en Sonido de Windows) o un
              cable virtual tipo <strong>VB-Audio</strong>. Con “Pestaña / pantalla” marca <strong>Compartir audio</strong>.
            </p>
          </div>

          <p className="text-[11px] text-white/25 font-sans">
            Espacio play/pausa · S re-sincronizar · ←/→ ajuste · ↑/↓ pista · Esc salir
          </p>
        </aside>

        {/* ============ RIGHT: lyrics ============ */}
        <section
          ref={scrollerRef}
          onWheel={() => (userScrolledAt.current = performance.now())}
          onTouchMove={() => (userScrolledAt.current = performance.now())}
          className="h-full overflow-y-auto no-bar px-14 xl:px-20"
          style={{
            paddingTop: '42vh',
            paddingBottom: '42vh',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)',
          }}
        >
          {lyrics === null && <p className="text-white/35 font-sans text-lg">Buscando letra…</p>}
          {lyrics && !lyrics.found && (
            <div className="space-y-2">
              <p className="text-white/45 font-serif text-3xl">Sin letra sincronizada</p>
              <p className="text-white/30 font-sans">LRCLIB no tiene esta pista.</p>
            </div>
          )}
          {lyrics?.found && synced.length === 0 && (
            <div className="space-y-4">
              <p className="text-white/35 font-sans text-sm">
                {lyrics.instrumental ? 'Instrumental.' : 'Solo hay letra sin sincronizar:'}
              </p>
              {!lyrics.instrumental &&
                lyrics.plain.split('\n').map((l, i) => (
                  <p key={i} className="font-serif text-2xl text-white/55 leading-snug">
                    {l}
                  </p>
                ))}
            </div>
          )}
          {lyricNodes}
        </section>
      </div>
    </div>,
    document.body
  )
}

const nudgeCls =
  'w-8 h-8 rounded-lg border border-white/15 hover:border-white/40 hover:bg-white/10 text-sm transition-colors'

function IconBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-10 h-10 shrink-0 rounded-full border border-white/15 hover:border-white/40 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent flex items-center justify-center transition-colors"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        {children}
      </svg>
    </button>
  )
}

// Elapsed time (formatDuration renders "" at 0, which would blank the clock).
function clockText(secs) {
  const s = Math.max(0, Math.floor(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Bar spectrum drawn from the analyser's frequency data.
function drawSpectrum(canvas, freq, accent) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  const bars = 64
  const step = Math.floor(freq.length / 2 / bars) || 1
  const bw = w / bars
  for (let i = 0; i < bars; i++) {
    let sum = 0
    for (let j = 0; j < step; j++) sum += freq[i * step + j] || 0
    const v = sum / step / 255
    const bh = Math.max(2, v * h)
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.25 + v * 0.75
    ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 3), bh)
  }
  ctx.globalAlpha = 1
}
