import type { Menu, WorkspaceLeaf } from "obsidian";

/**
 * P4 file action types (from p4 opened)
 */
export type P4Action = "edit" | "add" | "delete" | "branch" | "integrate" | "move/add" | "move/delete";

/**
 * Extended status for file decorators (includes synced status)
 */
export type P4DecoratorStatus = P4Action | "synced" | "locked";

/**
 * Status of a file in a changelist
 */
export interface P4FileStatus {
    /** Depot path (//depot/...) */
    depotFile: string;
    /** Local/client path */
    clientFile: string;
    /** Path relative to vault */
    vaultPath: string;
    /** Action being performed */
    action: P4Action;
    /** Changelist number (default or numbered) */
    changelist: number | "default";
    /** File type (text, binary, etc.) */
    type?: string;
    /** Revision number */
    rev?: number;
    /** Have revision (what client has) */
    haveRev?: number;
}

/**
 * A Perforce changelist
 */
export interface P4Changelist {
    /** Changelist number */
    change: number | "default";
    /** Changelist description */
    description: string;
    /** User who owns the changelist */
    user: string;
    /** Client/workspace name */
    client: string;
    /** Status: pending, submitted, shelved */
    status: "pending" | "submitted" | "shelved";
    /** Date of changelist */
    date?: string;
    /** Files in this changelist */
    files?: P4FileStatus[];
}

/**
 * Result of p4 sync operation
 */
export interface P4SyncResult {
    /** Files that were synced */
    files: P4SyncedFile[];
    /** Total bytes synced */
    totalBytes?: number;
}

export interface P4SyncedFile {
    depotFile: string;
    clientFile: string;
    vaultPath: string;
    action: "added" | "updated" | "deleted" | "upToDate";
    rev: number;
}

/**
 * P4 connection/workspace info
 */
export interface P4Info {
    userName: string;
    clientName: string;
    clientRoot: string;
    serverAddress: string;
    serverVersion?: string;
}

/**
 * Result of checking P4 requirements
 */
export type P4RequirementsResult = "valid" | "missing-p4" | "not-in-workspace" | "not-logged-in";

/**
 * Current plugin state
 */
export interface PluginState {
    currentAction: CurrentP4Action;
    isReady: boolean;
}

export enum CurrentP4Action {
    idle = 0,
    syncing = 1,
    submitting = 2,
    reverting = 3,
    checkingOut = 4,
    refreshing = 5,
}

/**
 * Diff information for a file
 */
export interface P4DiffResult {
    depotFile: string;
    localFile: string;
    /** Original content from depot */
    depotContent: string;
    /** Current local content */
    localContent: string;
    /** Unified diff output */
    diffText?: string;
}

/**
 * Blame information for a single line
 */
export interface P4BlameLine {
    /** Line number (1-based) */
    lineNumber: number;
    /** Changelist that last modified this line */
    changelist: number;
    /** User who made the change */
    user: string;
    /** Date of the change */
    date?: string;
    /** Line content */
    content: string;
    /** Changelist description (first line) */
    description?: string;
}

/**
 * Full blame result for a file
 */
export interface P4BlameResult {
    filePath: string;
    lines: P4BlameLine[];
    /** Timestamp when blame was fetched */
    fetchedAt: number;
}

/**
 * Submitted changelist history entry
 */
export interface P4HistoryEntry {
    change: number;
    user: string;
    client: string;
    date: string;
    description: string;
    files?: {
        depotFile: string;
        action: P4Action;
        rev: number;
    }[];
}

/**
 * A file with merge conflicts that needs resolution
 */
export interface P4ConflictFile {
    /** Depot path (//depot/...) */
    depotFile: string;
    /** Local/client path */
    clientFile: string;
    /** Path relative to vault */
    vaultPath: string;
    /** Base revision (common ancestor) */
    baseRev: number;
    /** Their revision (depot version) */
    theirRev: number;
    /** Type of conflict */
    conflictType: "content" | "action";
    /** From file (for integrations) */
    fromFile?: string;
}

/**
 * Content versions for three-way merge
 */
export interface P4MergeVersions {
    /** Base version (common ancestor) */
    base: string;
    /** Their version (depot/submitted) */
    theirs: string;
    /** Your version (local/working) */
    yours: string;
}

/**
 * Actions for resolving conflicts
 */
export type P4ResolveAction = "accept-yours" | "accept-theirs" | "accept-merged" | "accept-safe-merge";

/**
 * Plugin settings interface
 */
export interface P4PluginSettings {
    /** Custom path to p4 executable */
    p4Path: string;
    /** P4PORT - Server address (e.g., perforce:1666) */
    p4Port: string;
    /** P4USER - Username */
    p4User: string;
    /** P4CLIENT - Workspace/client name */
    p4Client: string;
    /** Enable auto-checkout when editing files */
    autoCheckout: boolean;
    /** Automatically add new files to Perforce */
    autoAddNewFiles: boolean;
    /** Show status bar */
    showStatusBar: boolean;
    /** Sync on plugin startup */
    syncOnStartup: boolean;
    /** Default submit message template */
    submitMessageTemplate: string;
    /** Show popup notifications */
    showNotices: boolean;
    /** Refresh source control view automatically */
    refreshSourceControl: boolean;
    /** Refresh interval in milliseconds */
    refreshInterval: number;
    /** Show inline blame annotation for current line */
    showInlineBlame: boolean;
}

/**
 * Tree item for displaying files in a tree structure
 */
export interface TreeItem<T = P4FileStatus> {
    title: string;
    path: string;
    vaultPath: string;
    data?: T;
    children?: TreeItem<T>[];
}

/**
 * Extend Obsidian's workspace type declarations
 */
declare module "obsidian" {
    interface Workspace {
        on(
            name: "obsidian-p4:refresh",
            callback: () => void,
            ctx?: unknown
        ): EventRef;
        on(
            name: "obsidian-p4:refresh-now",
            callback: () => void,
            ctx?: unknown
        ): EventRef;
        on(
            name: "obsidian-p4:status-changed",
            callback: (files: P4FileStatus[]) => void,
            ctx?: unknown
        ): EventRef;
        on(
            name: "obsidian-p4:menu",
            callback: (
                menu: Menu,
                path: string,
                source: string,
                leaf?: WorkspaceLeaf
            ) => unknown,
            ctx?: unknown
        ): EventRef;
        trigger(name: string, ...data: unknown[]): void;
        trigger(name: "obsidian-p4:refresh"): void;
        trigger(name: "obsidian-p4:refresh-now"): void;
        trigger(name: "obsidian-p4:status-changed", files: P4FileStatus[]): void;
        trigger(
            name: "obsidian-p4:menu",
            menu: Menu,
            path: string,
            source: string,
            leaf?: WorkspaceLeaf
        ): void;
    }
}

