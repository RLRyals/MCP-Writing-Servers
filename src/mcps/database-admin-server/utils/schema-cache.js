// src/mcps/database-admin-server/utils/schema-cache.js
// Schema caching utility with 5-minute TTL

export class SchemaCache {
    constructor(ttlMinutes = 5) {
        this.cache = new Map();
        this.ttlMs = ttlMinutes * 60 * 1000;

        // Cache statistics for monitoring
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Get cached value if exists and not expired
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null if not found/expired
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > this.ttlMs) {
            // Entry expired, remove it
            this.cache.delete(key);
            this.stats.evictions++;
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return entry.value;
    }

    /**
     * Set cache value with current timestamp
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     */
    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    /**
     * Check if key exists and is not expired
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Invalidate (delete) a specific cache key
     * @param {string} key - Cache key to invalidate
     */
    invalidate(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.evictions++;
        }
        return deleted;
    }

    /**
     * Invalidate all cache keys matching a pattern
     * @param {RegExp|string} pattern - Pattern to match against keys
     */
    invalidatePattern(pattern) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        let count = 0;

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
                this.stats.evictions++;
            }
        }

        return count;
    }

    /**
     * Clear all cache entries
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.stats.evictions += size;
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats including hit rate
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: `${hitRate}%`,
            ttlMinutes: this.ttlMs / 60000
        };
    }

    /**
     * Clean up expired entries (garbage collection)
     * Can be called periodically to free memory
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
                cleaned++;
                this.stats.evictions++;
            }
        }

        return cleaned;
    }

    /**
     * Generate cache key for schema data
     * @param {string} table - Table name
     * @param {string} type - Type of schema data (e.g., 'schema', 'relationships', 'columns')
     * @param {Object} params - Additional parameters
     * @returns {string} - Cache key
     */
    static generateKey(table, type, params = {}) {
        const paramStr = Object.keys(params).length > 0
            ? ':' + JSON.stringify(params)
            : '';
        return `${type}:${table}${paramStr}`;
    }
}

// Singleton instance for shared caching
export const schemaCache = new SchemaCache(5);
