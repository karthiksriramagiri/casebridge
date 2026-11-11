'use client'

/* ═══════════════════════════════════════════════════════════════════════════
   Putting a file into Supabase Storage.

   Every upload in the center goes through here: the files Faisal attaches to
   a brief, the benchmark on a new assignment, the still on a manual launch.

   The file goes straight from the browser to Storage. Our own route only
   hands back a signed URL — it never carries the bytes, because a serverless
   function rejects a request body of any real size (around 4.5MB) whatever
   limit the code claims to allow. A 300MB video uploaded this way is no
   different from a 3MB one; it just takes longer.

   There is no size limit in this file, in the route, or on the buckets. The
   only ceiling left is the Supabase project's own upload limit, set in the
   dashboard under Storage → Settings, and the error below names it so a
   refusal reads as a setting rather than as a bug in the page.

   `onProgress` is reported where the browser can report it, which is the
   point of doing it this way: a long upload that shows nothing looks hung,
   and the one thing people do with an upload that looks hung is start it
   again.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Uploaded = {
  url: string
  name: string
  kind: 'image' | 'video' | 'file'
}

export type UploadBucket = 'benchmark' | 'upload'

/** How big a file is, for a message a person reads. */
export function fileSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/** PUT the file to the signed URL, reporting progress. XHR rather than fetch:
 *  fetch cannot report upload progress, and this is the one place it matters. */
function put(url: string, file: File, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    /* Storage reads this on a signed upload; without it a second attempt at
       the same path is refused rather than replacing a half-finished file. */
    xhr.setRequestHeader('x-upsert', 'true')
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      /* The one refusal worth naming, because it is the only ceiling left
         and it is not ours: Supabase caps every upload at the project's
         own limit (Storage → Settings → Upload file size limit), whatever
         the bucket allows. Nothing in this code or in the route can lift
         it, so the message says where it is set rather than reading as a
         bug in the page. */
      const tooBig = xhr.status === 413 || /EntityTooLarge|exceeded the maximum allowed size/i.test(xhr.responseText ?? '')
      reject(new Error(
        tooBig
          ? `That file is ${fileSize(file.size)} — larger than the storage limit set on the Supabase project. Raise it in Storage → Settings → Upload file size limit.`
          : `Storage refused the file (${xhr.status}). ${(xhr.responseText ?? '').slice(0, 200)}`.trim(),
      ))
    }
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'))
    xhr.onabort = () => reject(new Error('The upload was cancelled.'))
    xhr.send(file)
  })
}

export async function uploadFile(
  file: File,
  bucket: UploadBucket = 'benchmark',
  onProgress?: (fraction: number) => void,
): Promise<Uploaded> {
  /* Ask for a signed URL, then PUT the file straight to Storage. The file
     never passes through our own route: a serverless function refuses a
     request body over about 4.5MB, so posting a cut through it could never
     have worked whatever limit the code claimed to allow. */
  const startRes = await fetch('/api/creative/assignments/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bucket, filename: file.name, type: file.type, size: file.size }),
  })
  const start = await startRes.json().catch(() => ({}))
  if (!startRes.ok || !start.signedUrl) throw new Error(start.error ?? 'Could not start the upload.')

  await put(start.signedUrl, file, onProgress)
  return { url: start.url as string, name: start.name as string, kind: start.kind as Uploaded['kind'] }
}
