// src/mcps/database-admin-server/utils/compression-utils.js
// Gzip compression utilities for backup files

import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import fsSync from 'fs';
import { BackupConfig } from '../config/backup-config.js';

export class CompressionUtils {
    /**
     * Compress data using gzip
     */
    static async compress(data, level = BackupConfig.compression.level) {
        return new Promise((resolve, reject) => {
            zlib.gzip(data, { level }, (err, compressed) => {
                if (err) reject(err);
                else resolve(compressed);
            });
        });
    }

    /**
     * Decompress gzip data
     */
    static async decompress(data) {
        return new Promise((resolve, reject) => {
            zlib.gunzip(data, (err, decompressed) => {
                if (err) reject(err);
                else resolve(decompressed);
            });
        });
    }

    /**
     * Compress a file using streams (for large files)
     */
    static async compressFile(inputPath, outputPath, level = BackupConfig.compression.level) {
        try {
            const readStream = fsSync.createReadStream(inputPath);
            const writeStream = fsSync.createWriteStream(outputPath);
            const gzip = zlib.createGzip({ level });

            await pipeline(readStream, gzip, writeStream);

            return { success: true, outputPath };
        } catch (error) {
            console.error('[COMPRESSION] Failed to compress file:', error);
            throw new Error(`Failed to compress file: ${error.message}`);
        }
    }

    /**
     * Decompress a file using streams (for large files)
     */
    static async decompressFile(inputPath, outputPath) {
        try {
            const readStream = fsSync.createReadStream(inputPath);
            const writeStream = fsSync.createWriteStream(outputPath);
            const gunzip = zlib.createGunzip();

            await pipeline(readStream, gunzip, writeStream);

            return { success: true, outputPath };
        } catch (error) {
            console.error('[COMPRESSION] Failed to decompress file:', error);
            throw new Error(`Failed to decompress file: ${error.message}`);
        }
    }

    /**
     * Create a compression stream
     */
    static createCompressionStream(level = BackupConfig.compression.level) {
        return zlib.createGzip({ level });
    }

    /**
     * Create a decompression stream
     */
    static createDecompressionStream() {
        return zlib.createGunzip();
    }

    /**
     * Test if a file is gzip compressed
     */
    static isGzipFile(filename) {
        return filename.endsWith('.gz');
    }

    /**
     * Get compression ratio
     */
    static getCompressionRatio(originalSize, compressedSize) {
        if (originalSize === 0) return 0;
        return ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
    }
}

export default CompressionUtils;
