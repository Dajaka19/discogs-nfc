// Audio capture helpers for the visualizer.
//
// Browsers only expose device labels/ids AFTER microphone permission has been
// granted, so the flow is: ensureAudioPermission() → listAudioInputs() → pick.
// On Windows the device that carries "what the PC is playing" is usually
// "Stereo Mix" / "Mezcla estéreo", or a virtual cable (VB-Audio).

export const DISPLAY_SOURCE = '__display__' // pseudo-device: share a tab/screen

// Ask once for mic permission so enumerateDevices() returns labelled devices.
// Returns true when permission is (already) granted.
export async function ensureAudioPermission() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

// True when the browser has already handed us labelled devices (permission ok).
export async function hasAudioPermission() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.some((d) => d.kind === 'audioinput' && d.deviceId && d.label)
  } catch {
    return false
  }
}

// [{ deviceId, label }] for every audio input, de-duplicated.
export async function listAudioInputs() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const seen = new Set()
    const out = []
    for (const d of devices) {
      if (d.kind !== 'audioinput' || !d.deviceId) continue
      if (seen.has(d.deviceId)) continue
      seen.add(d.deviceId)
      out.push({ deviceId: d.deviceId, label: d.label || 'Entrada de audio' })
    }
    return out
  } catch {
    return []
  }
}

// Subscribe to device plug/unplug. Returns an unsubscribe function.
export function onDeviceChange(handler) {
  const md = navigator.mediaDevices
  if (!md?.addEventListener) return () => {}
  md.addEventListener('devicechange', handler)
  return () => md.removeEventListener('devicechange', handler)
}

// Open a capture stream for the chosen source.
//   deviceId === DISPLAY_SOURCE → share a tab/screen (must tick "share audio")
//   otherwise                   → that audio input device
// Echo cancellation / noise suppression / AGC are disabled: they are tuned for
// speech and would mangle music (and suppress it as "noise").
export async function openInputStream(deviceId) {
  let stream
  if (deviceId === DISPLAY_SOURCE) {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('No se compartió audio. Marca "Compartir audio" al elegir la pestaña o pantalla.')
    }
    // The video track is only a side effect of getDisplayMedia — drop it.
    stream.getVideoTracks().forEach((t) => t.stop())
  } else {
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }
    if (deviceId) audio.deviceId = { exact: deviceId }
    stream = await navigator.mediaDevices.getUserMedia({ audio })
  }
  return stream
}

// Wrap a stream in an AnalyserNode. Deliberately NOT connected to the
// destination, so nothing is played back (no echo / feedback).
export function createAnalyser(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.8
  source.connect(analyser)
  return {
    ctx,
    stream,
    analyser,
    timeBuf: new Uint8Array(analyser.fftSize),
    freqBuf: new Uint8Array(analyser.frequencyBinCount),
  }
}

// Tear down everything opened above.
export function closeAudio(a) {
  if (!a) return
  a.stream?.getTracks?.().forEach((t) => t.stop())
  a.ctx?.close?.()
}

// Root-mean-square level (0..1) of the current time-domain frame.
export function readLevel(a) {
  if (!a?.analyser) return 0
  a.analyser.getByteTimeDomainData(a.timeBuf)
  let sum = 0
  for (let i = 0; i < a.timeBuf.length; i++) {
    const v = (a.timeBuf[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / a.timeBuf.length)
}
