import { setIcon } from "obsidian";
import type ObsidianP4 from "../main";
import type { P4DecoratorStatus, P4FileStatus } from "../types";

/**
 * Icons for each status (Lucide icon names)
 */
const STATUS_ICONS: Record<P4DecoratorStatus, string> = {
    edit: "file-pen-line",
    add: "file-plus",
    delete: "file-x",
    branch: "git-branch",
    integrate: "git-merge",
    "move/add": "copy-plus",
    "move/delete": "copy-minus",
    synced: "folder-dot",
    locked: "user-lock",
};

/**
 * CSS classes for each status (for coloring)
 */
const STATUS_CLASSES: Record<P4DecoratorStatus, string> = {
    edit: "p4-status-edit",
    add: "p4-status-add",
    delete: "p4-status-delete",
    branch: "p4-status-branch",
    integrate: "p4-status-integrate",
    "move/add": "p4-status-move",
    "move/delete": "p4-status-move",
    synced: "p4-status-synced",
    locked: "p4-status-locked",
};

/**
 * Tooltip text for each status
 */
const STATUS_TOOLTIPS: Record<P4DecoratorStatus, string> = {
    edit: "Checked out for editing",
    add: "Marked for add",
    delete: "Marked for delete",
    branch: "Branched",
    integrate: "Integrated",
    "move/add": "Moved (add)",
    "move/delete": "Moved (delete)",
    synced: "Synced from depot (read-only)",
    locked: "Locked (exclusive)",
};

/**
 * Manages file status decorators in the file explorer and tabs
 */
export class P4FileDecorators {
    private plugin: ObsidianP4;
    private observer: MutationObserver | null = null;
    
    /** Files opened in P4 (checked out, add, delete, etc.) */
    private openedFiles: Map<string, P4FileStatus> = new Map();
    
    /** Files synced from depot (not opened) */
    private syncedFiles: Set<string> = new Set();
    
    private isDecorating: boolean = false;
    private decorateTimeout: NodeJS.Timeout | null = null;

    constructor(plugin: ObsidianP4) {
        this.plugin = plugin;
    }

    /**
     * Start watching for DOM changes and decorating files
     */
    start(): void {
        // Initial decoration (delayed to avoid blocking)
        this.updateFileStatus(this.plugin.getCachedOpenedFiles());
        void this.loadSyncedFiles().then(() => {
            this.decorateAll();
        });

        // Watch for DOM changes (new files appearing in explorer/tabs)
        this.observer = new MutationObserver(() => {
            this.scheduleDecorate();
        });

        // Observe the workspace container for changes
        const workspaceEl = document.querySelector(".workspace");
        if (workspaceEl) {
            this.observer.observe(workspaceEl, {
                childList: true,
                subtree: true,
            });
        }

        // Listen for status changes
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("obsidian-p4:status-changed", (files: P4FileStatus[]) => {
                this.updateFileStatus(files);
                this.scheduleDecorate();
            })
        );

        // Listen for refresh events to reload synced files
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("obsidian-p4:refresh", () => {
                void this.loadSyncedFiles().then(() => this.scheduleDecorate());
            })
        );
        
        // Listen for immediate refresh events
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("obsidian-p4:refresh-now", () => {
                void this.loadSyncedFiles().then(() => this.scheduleDecorate());
            })
        );
    }

    /**
     * Load synced files from P4
     */
    private async loadSyncedFiles(): Promise<void> {
        if (!this.plugin.p4Ready) return;
        
        try {
            this.syncedFiles = await this.plugin.p4Manager.getHaveFiles();
            console.debug("P4 decorator: loaded", this.syncedFiles.size, "synced files");
        } catch (error) {
            console.error("P4 decorator: failed to load synced files:", error);
        }
    }

    /**
     * Schedule decoration with debouncing to prevent infinite loops
     */
    private scheduleDecorate(): void {
        if (this.decorateTimeout) {
            clearTimeout(this.decorateTimeout);
        }
        this.decorateTimeout = setTimeout(() => {
            this.decorateAll();
        }, 100);
    }

    /**
     * Stop watching and remove all decorations
     */
    stop(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.decorateTimeout) {
            clearTimeout(this.decorateTimeout);
        }
        this.removeAllDecorations();
    }

    /**
     * Update the opened files map
     */
    updateFileStatus(files: P4FileStatus[]): void {
        this.openedFiles.clear();
        for (const file of files) {
            this.openedFiles.set(file.vaultPath, file);
        }
    }

    /**
     * Get the decorator status for a file path
     */
    private getStatusForPath(vaultPath: string): P4DecoratorStatus | null {
        // First check if file is opened (checked out/add/delete/etc.)
        const opened = this.findOpenedForPath(vaultPath);
        if (opened) {
            // Check if it has exclusive lock flag in the type
            if (opened.type?.includes("+l")) {
                return "locked";
            }
            return opened.action;
        }
        
        // Then check if file is synced from depot
        if (this.isSyncedFile(vaultPath)) {
            return "synced";
        }
        
        // File is not in depot (local only) - no decorator
        return null;
    }

    /**
     * Check if a file is synced from depot
     */
    private isSyncedFile(vaultPath: string): boolean {
        // Try exact match
        if (this.syncedFiles.has(vaultPath)) return true;
        
        // Try with .md extension
        if (this.syncedFiles.has(vaultPath + ".md")) return true;
        
        // Try case-insensitive matching
        const lowerPath = vaultPath.toLowerCase();
        for (const syncedPath of this.syncedFiles) {
            if (syncedPath.toLowerCase() === lowerPath) return true;
        }
        
        return false;
    }

    /**
     * Decorate all visible files in explorer and tabs
     */
    private decorateAll(): void {
        // Prevent re-entry to avoid infinite loops
        if (this.isDecorating) return;
        this.isDecorating = true;
        
        // Disconnect observer while decorating
        if (this.observer) {
            this.observer.disconnect();
        }
        
        try {
            this.decorateFileExplorer();
            this.decorateTabs();
        } finally {
            // Re-enable observer after a delay
            setTimeout(() => {
                this.isDecorating = false;
                const workspaceEl = document.querySelector(".workspace");
                if (workspaceEl && this.observer) {
                    this.observer.observe(workspaceEl, {
                        childList: true,
                        subtree: true,
                    });
                }
            }, 200);
        }
    }

    /**
     * Check if an element is inside the source control view (to prevent double decoration)
     */
    private isInsideSourceControlView(element: Element): boolean {
        return element.closest(".p4-source-control-view") !== null;
    }

    /**
     * Add decorations to files in the file explorer
     */
    private decorateFileExplorer(): void {
        // Find all file items in the file explorer
        const fileItems = Array.from(document.querySelectorAll(".nav-file-title"));
        
        for (const item of fileItems) {
            // Skip items inside source control view to prevent double decoration
            if (this.isInsideSourceControlView(item)) {
                continue;
            }

            const dataPath = item.getAttribute("data-path");
            if (!dataPath) continue;

            // Remove existing decorator
            const existing = item.querySelector(".p4-file-decorator");
            if (existing) {
                existing.remove();
            }

            // Get status for this file
            const status = this.getStatusForPath(dataPath);
            
            if (status) {
                this.addDecorator(item as HTMLElement, status);
            }
        }
    }

    /**
     * Find opened file status for a given path
     */
    private findOpenedForPath(dataPath: string): P4FileStatus | undefined {
        // Exact match
        let status = this.openedFiles.get(dataPath);
        if (status) return status;
        
        // Try with .md extension
        status = this.openedFiles.get(dataPath + ".md");
        if (status) return status;
        
        // Try matching by ending
        for (const [storedPath, fileStatus] of this.openedFiles) {
            if (storedPath.endsWith("/" + dataPath) || storedPath.endsWith("\\" + dataPath)) {
                return fileStatus;
            }
            const storedFilename = storedPath.split(/[/\\]/).pop();
            const dataFilename = dataPath.split(/[/\\]/).pop();
            if (storedFilename && dataFilename && storedFilename === dataFilename) {
                return fileStatus;
            }
        }
        
        return undefined;
    }

    /**
     * Add decorations to open tabs
     */
    private decorateTabs(): void {
        const tabs = Array.from(document.querySelectorAll(".workspace-tab-header"));
        
        for (const tab of tabs) {
            const titleEl = tab.querySelector(".workspace-tab-header-inner-title");
            if (!titleEl) continue;

            const tabText = titleEl.textContent || "";
            
            // Remove existing decorator
            const existing = tab.querySelector(".p4-tab-decorator");
            if (existing) {
                existing.remove();
            }

            // Find matching file by name
            const status = this.findStatusByName(tabText);
            if (status) {
                this.addTabDecorator(tab as HTMLElement, status);
            }
        }
    }

    /**
     * Find status by filename (for tab matching)
     */
    private findStatusByName(filename: string): P4DecoratorStatus | null {
        // First check opened files
        for (const [path, fileStatus] of this.openedFiles) {
            const name = path.split("/").pop() || path;
            if (name === filename || name === filename + ".md") {
                if (fileStatus.type?.includes("+l")) {
                    return "locked";
                }
                return fileStatus.action;
            }
        }
        
        // Then check synced files
        for (const path of this.syncedFiles) {
            const name = path.split("/").pop() || path;
            if (name === filename || name === filename + ".md") {
                return "synced";
            }
        }
        
        return null;
    }

    /**
     * Add a decorator element to a file explorer item
     */
    private addDecorator(element: HTMLElement, status: P4DecoratorStatus): void {
        const decorator = document.createElement("span");
        decorator.className = "p4-file-decorator p4-decorator-icon";
        decorator.addClass(STATUS_CLASSES[status]);
        decorator.setAttribute("aria-label", STATUS_TOOLTIPS[status]);
        decorator.setAttribute("title", STATUS_TOOLTIPS[status]);
        decorator.setAttribute("data-status", status);

        const icon = STATUS_ICONS[status] || "circle";
        setIcon(decorator, icon);
        
        element.appendChild(decorator);
    }

    /**
     * Add a decorator element to a tab header
     */
    private addTabDecorator(element: HTMLElement, status: P4DecoratorStatus): void {
        const titleInner = element.querySelector(".workspace-tab-header-inner");
        if (!titleInner) return;

        const decorator = document.createElement("span");
        decorator.className = "p4-tab-decorator p4-decorator-icon";
        decorator.addClass(STATUS_CLASSES[status]);
        decorator.setAttribute("aria-label", STATUS_TOOLTIPS[status]);
        decorator.setAttribute("title", STATUS_TOOLTIPS[status]);
        decorator.setAttribute("data-status", status);

        const icon = STATUS_ICONS[status] || "circle";
        setIcon(decorator, icon);
        
        titleInner.appendChild(decorator);
    }

    /**
     * Remove all decorations from the DOM
     */
    private removeAllDecorations(): void {
        const decorators = Array.from(document.querySelectorAll(".p4-file-decorator, .p4-tab-decorator"));
        for (const decorator of decorators) {
            decorator.remove();
        }
    }
}
