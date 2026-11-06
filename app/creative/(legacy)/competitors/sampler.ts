/* ═══════════════════════════════════════════════════════════════════════════
   Browser-side frame sampling — the ffmpeg replacement.

   The pipeline deploys to Vercel serverless, where there is no ffmpeg binary,
   so `ffmpeg -ss` is not an option for extracting frames. A <video> element
   can do the same job: seek to a timestamp, draw the current frame to a
   canvas, read it back as JPEG. Same output, no binary.

   Two things this cannot do, stated plainly because they bound the result:

   1. No true scene-change detection. Sampling is fixed-interval, so a cut
      falling between two samples is invisible. The classifier is told this
      and is instructed not to overstate shot-length precision.
   2. The video must be readable by the canvas. A cross-origin video without
      permissive CORS headers taints the canvas and `toBlob` throws — which is
      exactly what happens with a hotlinked Meta CDN URL. Those have to be
      downloaded and re-uploaded rather than sampled in place; the caller
      surfaces that as a real error rather than a silent empty timeline.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SampleResult = {
  frames: Blob[]
  times: number[]
  duration: number
}

export class SamplerError extends Error {
  constructor(message: string, readonly kind: 'cors' | 'load' | 'empty') {
    super(message)
  }
}

const TARGET_FRAMES = 20
const MIN_INTERVAL = 0.75   // seconds — denser than this adds cost, not signal

export async function sampleFrames(
  src: string,
  onProgress?: (done: number, total: number) => void
): Promise<SampleResult> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = src

  const duration = await new Promise<number>((resolve, reject) => {
    const fail = () => reject(new SamplerError(
      'The video could not be loaded in the browser. If it is a Meta CDN link it has probably expired — download the file and upload it instead.',
      'load'))
    video.onloadedmetadata = () => resolve(video.duration)
    video.onerror = fail
    setTimeout(fail, 30000)
  })

  if (!isFinite(duration) || duration <= 0) {
    throw new SamplerError('The video reports no duration.', 'load')
  }

  const count = Math.max(2, Math.min(TARGET_FRAMES, Math.floor(duration / MIN_INTERVAL)))
  // Offset by half a step: sampling at exactly 0 often lands on a black frame
  // before the first painted frame.
  const step = duration / count
  const times = Array.from({ length: count }, (_, i) => Math.min(duration - 0.05, i * step + step / 2))

  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 640 / (video.videoWidth || 640))
  canvas.width = Math.round((video.videoWidth || 640) * scale)
  canvas.height = Math.round((video.videoHeight || 360) * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new SamplerError('Canvas is unavailable in this browser.', 'load')

  const frames: Blob[] = []
  const kept: number[] = []

  for (let i = 0; i < times.length; i++) {
    await seek(video, times[i])
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    let blob: Blob | null
    try {
      blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    } catch {
      throw new SamplerError(
        'This video is served without CORS headers, so its frames cannot be read. Download the file and upload it instead of linking it.',
        'cors')
    }
    if (blob) { frames.push(blob); kept.push(Math.round(times[i] * 100) / 100) }
    onProgress?.(i + 1, times.length)
  }

  if (!frames.length) throw new SamplerError('No frames could be captured.', 'empty')
  return { frames, times: kept, duration }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { video.removeEventListener('seeked', done); resolve() }
    video.addEventListener('seeked', done)
    video.currentTime = t
    setTimeout(() => { video.removeEventListener('seeked', done); reject(new SamplerError('Seeking timed out.', 'load')) }, 15000)
  })
}
