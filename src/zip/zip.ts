/**
 * Zero-dependency ZIP archive builder using standard ZIP format specification.
 */

// Pre-computed CRC32 lookup table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[i] = c >>> 0;
}

export function calculateCrc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

interface ZipEntry {
    name: string;
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc32: number;
    dosTime: number;
    dosDate: number;
    offset: number;
}

export class ZipWriter {
    private entries: ZipEntry[] = [];
    private totalUncompressedSize = 0;

    /**
     * Converts a JavaScript Date to MS-DOS date and time format.
     */
    private static toDosDateTime(d: Date): { dosTime: number; dosDate: number } {
        const year = d.getFullYear();
        const dosYear = year >= 1980 ? year - 1980 : 0;
        const dosMonth = d.getMonth() + 1;
        const dosDay = d.getDate();
        const dosDate = (dosYear << 9) | (dosMonth << 5) | dosDay;

        const dosHours = d.getHours();
        const dosMinutes = d.getMinutes();
        const dosSeconds = Math.floor(d.getSeconds() / 2);
        const dosTime = (dosHours << 11) | (dosMinutes << 5) | dosSeconds;

        return { dosTime, dosDate };
    }

    /**
     * Adds a file to the ZIP archive.
     */
    public addFile(name: string, content: Uint8Array | ArrayBuffer | string, date: Date = new Date()): void {
        let dataBytes: Uint8Array;
        if (typeof content === 'string') {
            dataBytes = new TextEncoder().encode(content);
        } else if (content instanceof ArrayBuffer) {
            dataBytes = new Uint8Array(content);
        } else {
            dataBytes = content;
        }

        const nameBytes = new TextEncoder().encode(name);
        const crc = calculateCrc32(dataBytes);
        const { dosTime, dosDate } = ZipWriter.toDosDateTime(date);

        this.entries.push({
            name,
            nameBytes,
            data: dataBytes,
            crc32: crc,
            dosTime,
            dosDate,
            offset: 0 // populated on build
        });

        this.totalUncompressedSize += dataBytes.length;
    }

    /**
     * Returns total raw bytes added so far.
     */
    public getCurrentSize(): number {
        return this.totalUncompressedSize;
    }

    /**
     * Returns number of files added.
     */
    public getFileCount(): number {
        return this.entries.length;
    }

    /**
     * Resets the writer to start a fresh volume.
     */
    public reset(): void {
        this.entries = [];
        this.totalUncompressedSize = 0;
    }

    /**
     * Assembles all entries into an application/zip Blob.
     */
    public build(): Blob {
        const chunks: Uint8Array[] = [];
        let currentOffset = 0;

        // 1. Write Local File Headers + Data
        for (const entry of this.entries) {
            entry.offset = currentOffset;

            const header = new Uint8Array(30 + entry.nameBytes.length);
            const view = new DataView(header.buffer);

            view.setUint32(0, 0x04034b50, true); // Local file header signature
            view.setUint16(4, 20, true);         // Version needed (2.0)
            view.setUint16(6, 0x0800, true);     // General purpose bit flag (UTF-8 filename flag)
            view.setUint16(8, 0, true);          // Compression method (0 = store)
            view.setUint16(10, entry.dosTime, true);
            view.setUint16(12, entry.dosDate, true);
            view.setUint32(14, entry.crc32, true);
            view.setUint32(18, entry.data.length, true); // Compressed size
            view.setUint32(22, entry.data.length, true); // Uncompressed size
            view.setUint16(26, entry.nameBytes.length, true); // Filename length
            view.setUint16(28, 0, true);                 // Extra field length

            header.set(entry.nameBytes, 30);

            chunks.push(header);
            chunks.push(entry.data);

            currentOffset += header.length + entry.data.length;
        }

        const centralDirStartOffset = currentOffset;

        // 2. Write Central Directory Headers
        let centralDirSize = 0;
        for (const entry of this.entries) {
            const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
            const view = new DataView(cdHeader.buffer);

            view.setUint32(0, 0x02014b50, true); // Central directory header signature
            view.setUint16(4, 20, true);         // Version made by (2.0)
            view.setUint16(6, 20, true);         // Version needed (2.0)
            view.setUint16(8, 0x0800, true);     // General purpose bit flag (UTF-8)
            view.setUint16(10, 0, true);         // Compression method (0 = store)
            view.setUint16(12, entry.dosTime, true);
            view.setUint16(14, entry.dosDate, true);
            view.setUint32(16, entry.crc32, true);
            view.setUint32(20, entry.data.length, true); // Compressed size
            view.setUint32(24, entry.data.length, true); // Uncompressed size
            view.setUint16(28, entry.nameBytes.length, true); // Filename length
            view.setUint16(30, 0, true);         // Extra field length
            view.setUint16(32, 0, true);         // File comment length
            view.setUint16(34, 0, true);         // Disk number start
            view.setUint16(36, 0, true);         // Internal file attributes
            view.setUint32(38, 0, true);         // External file attributes
            view.setUint32(42, entry.offset, true); // Relative offset of local header

            cdHeader.set(entry.nameBytes, 46);
            chunks.push(cdHeader);
            centralDirSize += cdHeader.length;
        }

        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);
        eocdView.setUint32(0, 0x06054b50, true);
        eocdView.setUint16(8, this.entries.length, true);
        eocdView.setUint16(10, this.entries.length, true);
        eocdView.setUint32(12, centralDirSize, true);
        eocdView.setUint32(16, centralDirStartOffset, true);

        chunks.push(eocd);
        return new Blob(chunks as any[], { type: 'application/zip' });
    }

    /**
     * Triggers a browser download of the assembled ZIP file.
     */
    public download(filename: string): void {
        const blob = this.build();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/**
 * Unzips entries from a ZIP binary ArrayBuffer using standard DecompressionStream.
 * Zero external npm dependencies.
 */
export async function unzipEntries(rawBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
    const entries = new Map<string, Uint8Array>();
    if (rawBytes.length < 22) return entries;

    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);

    // 1. Locate End of Central Directory (EOCD) record (0x06054b50)
    let eocdOffset = -1;
    for (let i = rawBytes.length - 22; i >= Math.max(0, rawBytes.length - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }

    if (eocdOffset >= 0) {
        const totalEntries = view.getUint16(eocdOffset + 10, true);
        const cdOffset = view.getUint32(eocdOffset + 16, true);
        let cdPos = cdOffset;

        for (let i = 0; i < totalEntries && cdPos + 46 <= rawBytes.length; i++) {
            if (view.getUint32(cdPos, true) !== 0x02014b50) {
                break;
            }

            const compressionMethod = view.getUint16(cdPos + 10, true);
            const compressedSize = view.getUint32(cdPos + 20, true);
            const fileNameLength = view.getUint16(cdPos + 28, true);
            const extraFieldLength = view.getUint16(cdPos + 30, true);
            const fileCommentLength = view.getUint16(cdPos + 32, true);
            const localHeaderOffset = view.getUint32(cdPos + 42, true);

            const fileNameBytes = rawBytes.subarray(cdPos + 46, cdPos + 46 + fileNameLength);
            const fileName = new TextDecoder().decode(fileNameBytes);

            cdPos += 46 + fileNameLength + extraFieldLength + fileCommentLength;

            // Read data offset from local header
            if (localHeaderOffset + 30 > rawBytes.length) continue;
            if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;

            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const dataEnd = dataOffset + compressedSize;

            if (dataEnd > rawBytes.length) continue;

            const compressedData = rawBytes.subarray(dataOffset, dataEnd);

            if (compressionMethod === 0) {
                // Stored
                entries.set(fileName, compressedData);
            } else if (compressionMethod === 8) {
                // Deflate
                try {
                    const stream = new ReadableStream({
                        start(controller) {
                            controller.enqueue(compressedData);
                            controller.close();
                        }
                    }).pipeThrough(new DecompressionStream('deflate-raw'));
                    const uncompressedBuffer = await new Response(stream).arrayBuffer();
                    entries.set(fileName, new Uint8Array(uncompressedBuffer));
                } catch (e) {
                    console.warn(`Failed to decompress ZIP entry "${fileName}":`, e);
                }
            }
        }

        if (entries.size > 0) {
            return entries;
        }
    }

    // Fallback: Scan sequential local file headers if no valid Central Directory
    let offset = 0;
    while (offset + 30 <= rawBytes.length) {
        const signature = view.getUint32(offset, true);
        if (signature !== 0x04034b50) {
            break;
        }

        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const fileNameLength = view.getUint16(offset + 26, true);
        const extraFieldLength = view.getUint16(offset + 28, true);

        const fileNameBytes = rawBytes.subarray(offset + 30, offset + 30 + fileNameLength);
        const fileName = new TextDecoder().decode(fileNameBytes);

        const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
        const dataEnd = dataOffset + compressedSize;

        if (dataEnd > rawBytes.length || compressedSize === 0) {
            break;
        }

        const compressedData = rawBytes.subarray(dataOffset, dataEnd);

        if (compressionMethod === 0) {
            entries.set(fileName, compressedData);
        } else if (compressionMethod === 8) {
            try {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(compressedData);
                        controller.close();
                    }
                }).pipeThrough(new DecompressionStream('deflate-raw'));
                const uncompressedBuffer = await new Response(stream).arrayBuffer();
                entries.set(fileName, new Uint8Array(uncompressedBuffer));
            } catch (e) {
                console.warn(`Failed to decompress ZIP entry "${fileName}":`, e);
            }
        }

        offset = dataEnd;
    }

    return entries;
}
