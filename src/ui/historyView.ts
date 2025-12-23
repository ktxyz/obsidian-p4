import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ObsidianP4 from "../main";
import { HISTORY_VIEW_CONFIG } from "../constants";
import type { P4HistoryEntry } from "../types";

/**
 * View for displaying submitted changelist history
 */
export class P4HistoryView extends ItemView {
    private plugin: ObsidianP4;
    private history: P4HistoryEntry[] = [];
    private contentContainer: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianP4) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return HISTORY_VIEW_CONFIG.type;
    }

    getDisplayText(): string {
        return HISTORY_VIEW_CONFIG.name;
    }

    getIcon(): string {
        return HISTORY_VIEW_CONFIG.icon;
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("p4-history-view");

        // Header
        const header = container.createDiv({ cls: "p4-view-header" });
        
        const title = header.createDiv({ cls: "p4-view-title" });
        title.createSpan({ text: "Changelist History" });
        
        const actions = header.createDiv({ cls: "p4-view-actions" });
        
        // Refresh button
        const refreshBtn = actions.createEl("button", { 
            cls: "p4-action-button", 
            attr: { "aria-label": "Refresh" } 
        });
        setIcon(refreshBtn, "refresh-cw");
        refreshBtn.addEventListener("click", () => { void this.refresh(); });

        // Content container
        this.contentContainer = container.createDiv({ cls: "p4-view-content" });

        // Initial load
        await this.refresh();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Refresh the history
     */
    async refresh(): Promise<void> {
        if (!this.plugin.p4Ready) {
            this.renderNotConnected();
            return;
        }

        try {
            this.history = await this.plugin.p4Manager.getHistory(50);
            this.renderContent();
        } catch (error) {
            this.renderError((error as Error).message);
        }
    }

    /**
     * Render the history content
     */
    private renderContent(): void {
        this.contentContainer.empty();

        if (this.history.length === 0) {
            const empty = this.contentContainer.createDiv({ cls: "p4-empty-state" });
            empty.createEl("p", { text: "No changelist history found" });
            return;
        }

        const list = this.contentContainer.createDiv({ cls: "p4-history-list" });

        for (const entry of this.history) {
            this.renderHistoryEntry(list, entry);
        }
    }

    /**
     * Render a single history entry
     */
    private renderHistoryEntry(container: HTMLElement, entry: P4HistoryEntry): void {
        const item = container.createDiv({ cls: "p4-history-item" });

        // Header row
        const header = item.createDiv({ cls: "p4-history-header" });
        
        // Changelist number
        const changeNum = header.createSpan({ cls: "p4-history-change" });
        changeNum.createSpan({ text: `#${entry.change}` });

        // User
        const user = header.createSpan({ cls: "p4-history-user" });
        const userIcon = user.createSpan({ cls: "p4-history-icon" });
        setIcon(userIcon, "user");
        user.createSpan({ text: entry.user });

        // Date
        const date = header.createSpan({ cls: "p4-history-date" });
        const dateIcon = date.createSpan({ cls: "p4-history-icon" });
        setIcon(dateIcon, "calendar");
        date.createSpan({ text: this.formatDate(entry.date) });

        // Description
        const desc = item.createDiv({ cls: "p4-history-description" });
        desc.createEl("p", { text: entry.description || "(no description)" });

        // Expandable files section (lazy load)
        item.addEventListener("click", () => {
            const existing = item.querySelector(".p4-history-files");
            if (existing) {
                existing.remove();
                return;
            }

            void this.plugin.p4Manager.getChangelistFiles(entry.change)
                .then((files) => {
                    const filesContainer = item.createDiv({ cls: "p4-history-files" });
                    
                    if (files.length === 0) {
                        filesContainer.createEl("p", { text: "No files", cls: "p4-muted" });
                    } else {
                        for (const file of files) {
                            const fileItem = filesContainer.createDiv({ cls: "p4-history-file" });
                            const icon = fileItem.createSpan({ cls: "p4-history-file-icon" });
                            setIcon(icon, this.getActionIcon(file.action));
                            fileItem.createSpan({ text: file.depotFile });
                        }
                    }
                })
                .catch((error: Error) => {
                    console.error("Error loading changelist files:", error);
                });
        });
    }

    /**
     * Format date for display
     */
    private formatDate(dateStr: string): string {
        if (!dateStr) return "";
        
        // P4 dates are typically in format: 2024/01/15 14:30:00 or unix timestamp
        try {
            const timestamp = parseInt(dateStr, 10);
            if (!isNaN(timestamp)) {
                return new Date(timestamp * 1000).toLocaleString();
            }
            return dateStr;
        } catch {
            return dateStr;
        }
    }

    /**
     * Get icon for file action
     */
    private getActionIcon(action: string): string {
        switch (action) {
            case "add": return "file-plus";
            case "edit": return "edit";
            case "delete": return "file-minus";
            case "move/add": return "file-input";
            case "move/delete": return "file-output";
            case "branch": return "git-branch";
            case "integrate": return "merge";
            default: return "file";
        }
    }

    /**
     * Render not connected state
     */
    private renderNotConnected(): void {
        this.contentContainer.empty();
        const state = this.contentContainer.createDiv({ cls: "p4-empty-state" });
        state.createEl("p", { text: "Perforce is not connected" });
    }

    /**
     * Render error state
     */
    private renderError(message: string): void {
        this.contentContainer.empty();
        const state = this.contentContainer.createDiv({ cls: "p4-error-state" });
        state.createEl("p", { text: "Error loading history" });
        state.createEl("p", { text: message, cls: "p4-muted" });
    }
}

