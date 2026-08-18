import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchLyrics } from '../utils/lyrics'
import { formatDuration } from '../utils/tracklist'

// Full-screen "now playing" visualizer (desktop only), in the spirit of Apple
// Music's full-screen lyrics view: cover art, track/album/artist, synced lyrics
// and a live spectrum driven by the PC's audio.
//
// SYNC MODEL — a browser can't derive a playback POSITION from audio (that needs
// Shazam-style fingerprinting), so the captured audio acts as a TRANSPORT: sound
// onset starts the clock, sustained silence pauses it, and the user nudges the
// offset (or clicks a lyric line) to line things up exactly.
const SILENCE_RMS = 0.012 // below this counts as "no audio"
const SILENCE_PAUSE_MS = 2200 // silence this long pauses the clock

export default function Visualizer({ tracks, index, onIndex, album, artist, artUrl, accent, onClose }) {
  const track = tracks[index]
  const [listening, setListening] = useState(false)
  const [running, setRunning] = useState(false)
  const [position, setPosition] = useState(0)
  const [offset, setOffset] = useState(0)
  const [level, setLevel] = useState(0)
  const [lyrics, setLyrics] = useState(null) // null = loading
  const [audioError, setAudioError] = useState(null)

  const canvasRef = useRef(null)
  const lineRefs = useRef([])
  const audioRef = useRef({}) // { ctx, analyser, stream, timeBuf, freqBuf }
  const clockRef = useRef({ pos: 0, last: 0, running: false })
  const silenceSince = useRef(null)

  const trackArtist = track?._artist || artist
  const duration = track?._durationSecs || track?._totalDuration || null

  // ---- lyrics -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLyrics(null)
    if (!track) return
    fetchLyrics({ artist: trackArtist, track: track.title, album, duration }).then((r) => {
      if (!cancelled) setLyrics(r)
    })
    return () => {
      cancelled = true
    }
  }, [track?.title, trackArtist, album, duration])

  // Reset the clock when the track changes.
  useEffect(() => {
    clockRef.current.pos = 0
    setPosition(0)
    setOffset(0)
  }, [index])

  // ---- clock + audio analysis loop ---------------------------------------
  useEffect(() => {
    let raf
    const tick = () => {
      const now = performance.now()
      const c = clockRef.current
      if (c.running) {
        c.pos += (now - (c.last || now)) / 1000
        setPosition(c.pos)
      }
      c.last = now

      const a = audioRef.current
      if (a.analyser) {
        // level (RMS) drives the transport and the glow
        const time = a.timeBuf
        a.analyser.getByteTimeDomainData(time)
        let sum = 0
        for (let i = 0; i < time.length; i++) {
          const v = (time[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / time.length)
        setLevel(rms)

        if (rms > SILENCE_RMS) {
          silenceSince.current = null
          if (!c.running) {
            c.running = true
            setRunning(true)
          }
        } else if (silenceSince.current == null) {
          silenceSince.current = now
        } else if (now - silenceSince.current > SILENCE_PAUSE_MS && c.running) {
          c.running = false
          setRunning(false)
        }

        // spectrum
        a.analyser.getByteFrequencyData(a.freqBuf)
        drawSpectrum(canvasRef.current, a.freqBuf, accent)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [accent])

  // ---- audio capture ------------------------------------------------------
  async function startListening(mode) {
    setAudioError(null)
    try {
      const stream =
        mode === 'mic'
          ? await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })

      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop())
        throw new Error('No se compartió audio. Marca "Compartir audio" al elegir la pestaña o pantalla.')
      }
      // The video track is only a side effect of getDisplayMedia — drop it.
      stream.getVideoTracks().forEach((t) => t.stop())

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser) // NOT connected to destination → no echo
      audioRef.current = {
        ctx,
        stream,
        analyser,
        timeBuf: new Uint8Array(analyser.fftSize),
        freqBuf: new Uint8Array(analyser.frequencyBinCount),
      }
      setListening(true)
    } catch (err) {
      setAudioError(err?.message || 'No se pudo capturar el audio')
    }
  }

  function stopListening() {
    const a = audioRef.current
    a.stream?.getTracks().forEach((t) => t.stop())
    a.ctx?.close?.()
    audioRef.current = {}
    setListening(false)
    setLevel(0)
  }

  useEffect(() => stopListening, []) // cleanup on unmount

  // ---- lyric line tracking -----------------------------------------------
  const synced = lyrics?.synced || []
  const pos = position + offset
  const activeIdx = useMemo(() => {
    if (synced.length === 0) return -1
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
    return res
  }, [synced, pos])

  useEffect(() => {
    const el = lineRefs.current[activeIdx]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx])

  // ---- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ') {
        e.preventDefault()
        clockRef.current.running = !clockRef.current.running
        setRunning(clockRef.current.running)
      } else if (e.key === 'ArrowLeft') setOffset((o) => o - 0.5)
      else if (e.key === 'ArrowRight') setOffset((o) => o + 0.5)
      else if (e.key === 'ArrowDown' && index < tracks.length - 1) onIndex(index + 1)
      else if (e.key === 'ArrowUp' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onIndex, index, tracks.length])

  const restart = () => {
    clockRef.current.pos = 0
    setPosition(0)
  }
  const toggleClock = () => {
    clockRef.current.running = !clockRef.current.running
    setRunning(clockRef.current.running)
  }

  if (!track) return null
  const glow = Math.min(1, level * 6)
  const accentColor = accent || '#f5a623'

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#08080a] text-white overflow-hidden select-none">
      {/* blurred cover backdrop, breathing with the audio level */}
      {artUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${artUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: `blur(90px) saturate(1.6) brightness(${0.28 + glow * 0.18})`,
            transform: `scale(${1.25 + glow * 0.06})`,
            transition: 'filter 120ms linear, transform 120ms linear',
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 pointer-events-none" />

      <button
        onClick={onClose}
        title="Cerrar (Esc)"
        className="absolute top-5 right-6 z-20 text-white/60 hover:text-white transition-colors"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="relative z-10 h-full grid grid-cols-[minmax(320px,38%)_1fr] gap-10 px-12 py-10">
        {/* LEFT — art, metadata, transport */}
        <div className="flex flex-col justify-center min-w-0">
          {artUrl && (
            <img
              src={artUrl}
              alt=""
              className="w-full max-w-[420px] aspect-square object-cover rounded-2xl"
              style={{
                boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 ${40 + glow * 90}px ${accentColor}${
                  glow > 0.15 ? '55' : '22'
                }`,
              }}
            />
          )}
          <div className="mt-7 max-w-[420px]">
            <h1 className="font-serif text-4xl leading-tight">{track.title}</h1>
            <p className="font-sans text-lg text-white/70 mt-2">{trackArtist}</p>
            <p className="font-sans text-sm text-white/45 mt-0.5">{album}</p>
          </div>

          <canvas ref={canvasRef} width={560} height={70} className="mt-6 w-full max-w-[420px] h-[70px]" />

          <div className="mt-5 flex items-center gap-3 max-w-[420px]">
            <button
              onClick={() => index > 0 && onIndex(index - 1)}
              disabled={index === 0}
              title="Pista anterior (flecha arriba)"
              className="p-2 rounded-full border border-white/15 hover:border-white/40 disabled:opacity-30 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 20 9 12l10-8v16zM5 19V5h2v14H5z" />
              </svg>
            </button>
            <button
              onClick={toggleClock}
              title="Reproducir/Pausar reloj (Espacio)"
              className="p-3 rounded-full bg-white text-black hover:scale-105 transition-transform"
            >
              {running ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => index < tracks.length - 1 && onIndex(index + 1)}
              disabled={index >= tracks.length - 1}
              title="Pista siguiente (flecha abajo)"
              className="p-2 rounded-full border border-white/15 hover:border-white/40 disabled:opacity-30 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 4l10 8-10 8V4zM17 5h2v14h-2z" />
              </svg>
            </button>
            <button
              onClick={restart}
              title="Volver al inicio"
              className="p-2 rounded-full border border-white/15 hover:border-white/40 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <span className="font-mono text-sm text-white/60 ml-1">
              {clockText(pos)}
              {duration ? ` / ${formatDuration(duration)}` : ''}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 max-w-[420px]">
            {!listening ? (
              <>
                <button
                  onClick={() => startListening('system')}
                  className="px-3 py-2 rounded-lg text-sm font-sans bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
                >
                  Escuchar audio del PC
                </button>
                <button
                  onClick={() => startListening('mic')}
                  title="Usar micrófono o Stereo Mix"
                  className="px-3 py-2 rounded-lg text-sm font-sans bg-white/5 hover:bg-white/15 border border-white/10 transition-colors"
                >
                  Micro
                </button>
              </>
            ) : (
              <button
                onClick={stopListening}
                className="px-3 py-2 rounded-lg text-sm font-sans bg-green-500/15 border border-green-400/40 text-green-300 hover:bg-green-500/25 transition-colors"
              >
                ● Escuchando — detener
              </button>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setOffset((o) => o - 0.5)}
                title="Adelantar la letra (flecha izquierda)"
                className="w-8 h-8 rounded-lg border border-white/15 hover:border-white/40 text-sm transition-colors"
              >
                −
              </button>
              <span className="font-mono text-xs text-white/50 w-14 text-center">
                {offset >= 0 ? '+' : ''}
                {offset.toFixed(1)}s
              </span>
              <button
                onClick={() => setOffset((o) => o + 0.5)}
                title="Retrasar la letra (flecha derecha)"
                className="w-8 h-8 rounded-lg border border-white/15 hover:border-white/40 text-sm transition-colors"
              >
                +
              </button>
            </div>
          </div>
          {audioError && <p className="mt-2 text-xs text-red-400 font-sans max-w-[420px]">{audioError}</p>}
          {!listening && !audioError && (
            <p className="mt-2 text-xs text-white/35 font-sans max-w-[420px]">
              Al compartir marca <strong>“Compartir audio”</strong>. El reloj arranca solo cuando suena la música
              y se pausa en silencio; si la letra va desfasada usa − / + o pulsa una línea.
            </p>
          )}
        </div>

        {/* RIGHT — lyrics */}
        <div className="min-w-0 overflow-y-auto pr-4 py-[35vh]">
          {lyrics === null && <p className="text-white/40 font-sans">Buscando letra…</p>}
          {lyrics && !lyrics.found && <p className="text-white/40 font-sans">Sin letra para esta pista en LRCLIB.</p>}
          {lyrics?.found && synced.length === 0 && (
            <div className="space-y-3">
              <p className="text-white/40 font-sans text-sm">
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
          {synced.map((line, i) => {
            const active = i === activeIdx
            const past = i < activeIdx
            return (
              <p
                key={i}
                ref={(el) => (lineRefs.current[i] = el)}
                onClick={() => {
                  clockRef.current.pos = Math.max(0, line.time - offset)
                  setPosition(clockRef.current.pos)
                }}
                className={`font-serif leading-snug cursor-pointer transition-all duration-300 ${
                  active
                    ? 'text-white text-[2.6rem] my-5 drop-shadow-[0_0_24px_rgba(255,255,255,0.25)]'
                    : past
                    ? 'text-white/25 text-3xl my-4'
                    : 'text-white/45 text-3xl my-4'
                }`}
              >
                {line.text || '♪'}
              </p>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}

// Elapsed time, always shown (formatDuration renders "" at 0).
function clockText(secs) {
  const s = Math.max(0, Math.floor(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Mirrored bar spectrum drawn from the analyser's frequency data.
function drawSpectrum(canvas, freq, accent) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  const bars = 48
  const step = Math.floor(freq.length / 2 / bars) || 1
  const bw = w / bars
  for (let i = 0; i < bars; i++) {
    let sum = 0
    for (let j = 0; j < step; j++) sum += freq[i * step + j] || 0
    const v = sum / step / 255
    const bh = Math.max(2, v * h)
    ctx.fillStyle = accent || '#f5a623'
    ctx.globalAlpha = 0.35 + v * 0.65
    ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh)
  }
  ctx.globalAlpha = 1
}
