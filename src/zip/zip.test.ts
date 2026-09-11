import { describe, it, expect, vi } from "vitest";
import { ZipWriter, calculateCrc32, unzipEntries } from "./zip.js";

describe("ZipWriter & CRC-32", () => {
    it("computes accurate CRC32 values", () => {
        const text = new TextEncoder().encode("123456789");
        const crc = calculateCrc32(text);
        // Standard check value for "123456789" is 0xCBF43926 (3421780262)
        expect(crc).toBe(0xCBF43926);
    });

    it("creates a valid ZIP blob with single and multiple files", async () => {
        const writer = new ZipWriter();
        writer.addFile("test.txt", "Hello World!");
        writer.addFile("data.bin", new Uint8Array([1, 2, 3, 4, 5]));

        expect(writer.getFileCount()).toBe(2);
        expect(writer.getCurrentSize()).toBe(12 + 5);

        const blob = writer.build();
        expect(blob.type).toBe("application/zip");
        expect(blob.size).toBeGreaterThan(writer.getCurrentSize());

        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Verify Local file header signatures (0x04034b50 -> 50 4B 03 04 in little endian)
        expect(bytes[0]).toBe(0x50);
        expect(bytes[1]).toBe(0x4B);
        expect(bytes[2]).toBe(0x03);
        expect(bytes[3]).toBe(0x04);
    });

    it("unzips entries created by ZipWriter", async () => {
        const writer = new ZipWriter();
        writer.addFile("companies/123/company.v1.pb", new Uint8Array([10, 20, 30]));
        writer.addFile("companies/123/accounting.v1.pb.br", new Uint8Array([40, 50]));

        const blob = writer.build();
        const buffer = await blob.arrayBuffer();
        const entries = await unzipEntries(new Uint8Array(buffer));

        expect(entries.size).toBe(2);
        expect(entries.get("companies/123/company.v1.pb")).toEqual(new Uint8Array([10, 20, 30]));
        expect(entries.get("companies/123/accounting.v1.pb.br")).toEqual(new Uint8Array([40, 50]));
    });

    it("resets entries and size when starting a new volume", () => {
        const writer = new ZipWriter();
        writer.addFile("file1.txt", "Content 1");
        expect(writer.getFileCount()).toBe(1);
        expect(writer.getCurrentSize()).toBe(9);

        writer.reset();
        expect(writer.getFileCount()).toBe(0);
        expect(writer.getCurrentSize()).toBe(0);
    });

    it("triggers browser download with specified filename", () => {
        const writer = new ZipWriter();
        writer.addFile("doc.txt", "Test");

        let downloadedFilename = "";
        const origCreateObjectURL = URL.createObjectURL;
        const origRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => "blob:mock-zip");
        URL.revokeObjectURL = vi.fn();

        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            downloadedFilename = this.download;
        });

        writer.download("underlag_2026.zip");
        expect(downloadedFilename).toBe("underlag_2026.zip");

        URL.createObjectURL = origCreateObjectURL;
        URL.revokeObjectURL = origRevokeObjectURL;
        clickSpy.mockRestore();
    });
});
