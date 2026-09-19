// Minimal ZIP writer (STORE method — no compression).
//
// The payload here is JPEG/PNG photos, which are already compressed, so
// deflating them would add CPU for ~no size win. Storing keeps this small
// enough to audit and avoids pulling in a zip dependency.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Buffer
}

/** Build a ZIP archive from in-memory entries. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)  // local file header signature
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0, 6)           // flags
    local.writeUInt16LE(0, 8)           // method: stored
    local.writeUInt16LE(0, 10)          // mod time
    local.writeUInt16LE(0, 12)          // mod date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)       // compressed size
    local.writeUInt32LE(size, 22)       // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)          // extra length
    locals.push(local, nameBuf, entry.data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory signature
    central.writeUInt16LE(20, 4)         // version made by
    central.writeUInt16LE(20, 6)         // version needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)         // extra
    central.writeUInt16LE(0, 32)         // comment
    central.writeUInt16LE(0, 34)         // disk number
    central.writeUInt16LE(0, 36)         // internal attrs
    central.writeUInt32LE(0, 38)         // external attrs
    central.writeUInt32LE(offset, 42)    // local header offset
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + size
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)          // EOCD signature
  end.writeUInt16LE(0, 4)                   // disk number
  end.writeUInt16LE(0, 6)                   // central dir disk
  end.writeUInt16LE(entries.length, 8)      // entries on this disk
  end.writeUInt16LE(entries.length, 10)     // total entries
  end.writeUInt32LE(centralBuf.length, 12)  // central dir size
  end.writeUInt32LE(offset, 16)             // central dir offset
  end.writeUInt16LE(0, 20)                  // comment length

  return Buffer.concat([...locals, centralBuf, end])
}
