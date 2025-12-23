import type ObsidianP4 from "../main";
import type { P4BlameResult, P4BlameLine } from "../types";
import { isTextFile } from "../constants";

/**
 * Cache entry for blame data
 */
interface BlameCache {
    result: P4BlameResult;
    /** Time when the cache was created */
    cachedAt: number;
}

/**
 * Provider for P4 blame/annotate data with caching
 */
export class P4BlameProvider {
    private plugin: ObsidianP4;
    private cache: Map<string, BlameCache> = new Map();
    
    /** Cache for changelist descriptions */
    private descriptionCache: Map<number, string> = new Map();
    
    /** Cache TTL in milliseconds (5 minutes) */
    private readonly CACHE_TTL = 5 * 60 * 1000;
    
    /** Set of file paths currently being fetched */
    private pendingFetches: Set<string> = new Set();
    
    /** Callbacks waiting for fetch to complete */
    private waitingCallbacks: Map<string, ((result: P4BlameResult | null) => void)[]> = new Map();

    constructor(plugin: ObsidianP4) {
        this.plugin = plugin;
    }

    /**
     * Get blame data for a file, using cache if available
     */
    async getBlame(filePath: string, forceRefresh: boolean = false): Promise<P4BlameResult | null> {
        // Check cache first
        if (!forceRefresh) {
            const cached = this.cache.get(filePath);
            if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
                return cached.result;
            }
        }

        // If already fetching, wait for that fetch to complete
        if (this.pendingFetches.has(filePath)) {
            return new Promise((resolve) => {
                const callbacks = this.waitingCallbacks.get(filePath) || [];
                callbacks.push(resolve);
                this.waitingCallbacks.set(filePath, callbacks);
            });
        }

        // Fetch blame data
        return this.fetchBlame(filePath);
    }

    /**
     * Fetch blame data from P4
     */
    private async fetchBlame(filePath: string): Promise<P4BlameResult | null> {
        if (!this.plugin.p4Ready) {
            return null;
        }

        // Skip non-text files (binary files can't be annotated)
        if (!isTextFile(filePath)) {
            return null;
        }

        // Check if file is in depot first
        const isInDepot = await this.plugin.p4Manager.isFileInDepot(filePath);
        if (!isInDepot) {
            return null; // File not in Perforce, no blame data available
        }

        this.pendingFetches.add(filePath);

        try {
            const result = await this.plugin.p4Manager.annotate(filePath);
            
            // Fetch descriptions for all unique changelists
            await this.fetchDescriptions(result.lines);
            
            // Add descriptions to blame lines
            for (const line of result.lines) {
                line.description = this.descriptionCache.get(line.changelist) || "";
            }
            
            // Cache the result
            this.cache.set(filePath, {
                result,
                cachedAt: Date.now(),
            });

            // Notify waiting callbacks
            const callbacks = this.waitingCallbacks.get(filePath) || [];
            for (const callback of callbacks) {
                callback(result);
            }
            this.waitingCallbacks.delete(filePath);

            return result;
        } catch (error) {
            console.error("Failed to get blame for", filePath, error);
            
            // Notify waiting callbacks with null
            const callbacks = this.waitingCallbacks.get(filePath) || [];
            for (const callback of callbacks) {
                callback(null);
            }
            this.waitingCallbacks.delete(filePath);

            return null;
        } finally {
            this.pendingFetches.delete(filePath);
        }
    }

    /**
     * Fetch descriptions for changelists that aren't cached
     */
    private async fetchDescriptions(lines: P4BlameLine[]): Promise<void> {
        // Get unique changelists that we don't have descriptions for
        const changelists = new Set<number>();
        for (const line of lines) {
            if (!this.descriptionCache.has(line.changelist)) {
                changelists.add(line.changelist);
            }
        }

        // Fetch descriptions in parallel (limit to 5 concurrent)
        const changelistArray = Array.from(changelists);
        const batchSize = 5;
        
        for (let i = 0; i < changelistArray.length; i += batchSize) {
            const batch = changelistArray.slice(i, i + batchSize);
            await Promise.all(batch.map(async (cl) => {
                try {
                    const desc = await this.plugin.p4Manager.getChangelistDescription(cl);
                    this.descriptionCache.set(cl, desc);
                } catch {
                    this.descriptionCache.set(cl, "");
                }
            }));
        }
    }

    /**
     * Get blame for a specific line
     */
    async getBlameForLine(filePath: string, lineNumber: number): Promise<P4BlameLine | null> {
        const blame = await this.getBlame(filePath);
        if (!blame) return null;
        
        return blame.lines.find(line => line.lineNumber === lineNumber) || null;
    }

    /**
     * Invalidate cache for a file
     */
    invalidate(filePath: string): void {
        this.cache.delete(filePath);
    }

    /**
     * Invalidate all cache entries
     */
    invalidateAll(): void {
        this.cache.clear();
        this.descriptionCache.clear();
    }

    /**
     * Check if blame data is cached for a file
     */
    isCached(filePath: string): boolean {
        const cached = this.cache.get(filePath);
        return cached !== undefined && Date.now() - cached.cachedAt < this.CACHE_TTL;
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { count: number; oldestAge: number } {
        let oldestAge = 0;
        for (const entry of this.cache.values()) {
            const age = Date.now() - entry.cachedAt;
            if (age > oldestAge) {
                oldestAge = age;
            }
        }
        return { count: this.cache.size, oldestAge };
    }

    /**
     * Cleanup old cache entries
     */
    cleanup(): void {
        const now = Date.now();
        for (const [path, entry] of this.cache.entries()) {
            if (now - entry.cachedAt > this.CACHE_TTL * 2) {
                this.cache.delete(path);
            }
        }
    }
}
