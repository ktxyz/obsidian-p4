import type { P4PluginSettings } from "./types";

export const DATE_FORMAT = "YYYY-MM-DD";
export const DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

/**
 * Text file extensions that support blame and text editing
 */
export const TEXT_FILE_EXTENSIONS = new Set([
    "md", "txt", "markdown", "json", "yaml", "yml", "xml", "html", "htm",
    "css", "js", "ts", "tsx", "jsx", "py", "rb", "java", "c", "cpp", "h",
    "hpp", "cs", "go", "rs", "swift", "kt", "scala", "sh", "bash", "zsh",
    "ps1", "bat", "cmd", "sql", "graphql", "vue", "svelte", "astro",
    "canvas", // Obsidian canvas files (JSON-based)
    "base",   // P4 base files (text files during merge)
]);

/**
 * Check if a file extension is a text file
 */
export function isTextFile(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    return TEXT_FILE_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a markdown file
 */
export function isMarkdownFile(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    return ext === "md" || ext === "markdown";
}

/**
 * Check if a file is an editable file in Obsidian (markdown or canvas)
 * These files should trigger checkout modals when opened/edited
 */
export function isEditableFile(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    return ext === "md" || ext === "markdown" || ext === "canvas";
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: P4PluginSettings = {
    p4Path: "",
    p4Port: "",
    p4User: "",
    p4Client: "",
    autoCheckout: true,
    autoAddNewFiles: true, // Automatically add new files to Perforce
    showStatusBar: true,
    syncOnStartup: true, // Disabled by default - can freeze on large workspaces
    submitMessageTemplate: "vault update: {{date}}",
    showNotices: true,
    refreshSourceControl: true,
    refreshInterval: 5000,
    showInlineBlame: false, // Show blame annotation for current line
};

/**
 * Source control view configuration
 */
export const SOURCE_CONTROL_VIEW_CONFIG = {
    type: "p4-source-control",
    name: "Perforce",
    icon: "git-branch",
};

/**
 * History view configuration
 */
export const HISTORY_VIEW_CONFIG = {
    type: "p4-history-view",
    name: "P4 History",
    icon: "history",
};

/**
 * Diff view configuration
 */
export const DIFF_VIEW_CONFIG = {
    type: "p4-diff-view",
    name: "P4 Diff",
    icon: "file-diff",
};

/**
 * Merge view configuration (for conflict resolution)
 */
export const MERGE_VIEW_CONFIG = {
    type: "p4-merge-view",
    name: "P4 Merge",
    icon: "git-merge",
};

/**
 * Action display names for UI
 */
export const ACTION_DISPLAY_NAMES: Record<string, string> = {
    edit: "Edit",
    add: "Add",
    delete: "Delete",
    branch: "Branch",
    integrate: "Integrate",
    "move/add": "Move (Add)",
    "move/delete": "Move (Delete)",
};

/**
 * Status bar messages
 */
export const STATUS_MESSAGES = {
    idle: "P4",
    syncing: "P4: Syncing...",
    submitting: "P4: Submitting...",
    reverting: "P4: Reverting...",
    checkingOut: "P4: Checking out...",
    refreshing: "P4: Refreshing...",
};

