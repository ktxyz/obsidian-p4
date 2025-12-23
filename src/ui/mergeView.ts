import { ItemView, WorkspaceLeaf, setIcon, type ViewStateResult } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import type ObsidianP4 from "../main";
import { MERGE_VIEW_CONFIG } from "../constants";
import type { P4MergeVersions, P4ResolveAction } from "../types";

interface MergeViewState extends Record<string, unknown> {
    filePath: string;
}

/**
 * View for three-way merge conflict resolution
 * Shows Base, Theirs, Yours versions and allows manual merging
 */
export class P4MergeView extends ItemView {
    private plugin: ObsidianP4;
    private filePath: string = "";
    private versions: P4MergeVersions | null = null;
    private resultEditor: EditorView | null = null;
    private theirsEditor: EditorView | null = null;
    private yoursEditor: EditorView | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianP4) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return MERGE_VIEW_CONFIG.type;
    }

    getDisplayText(): string {
        if (this.filePath) {
            const fileName = this.filePath.split("/").pop() || this.filePath;
            return `Merge: ${fileName}`;
        }
        return MERGE_VIEW_CONFIG.name;
    }

    getIcon(): string {
        return MERGE_VIEW_CONFIG.icon;
    }

    async setState(state: MergeViewState, result: ViewStateResult): Promise<void> {
        this.filePath = state.filePath || "";
        await this.loadMerge();
        await super.setState(state, result);
    }

    getState(): MergeViewState {
        return { filePath: this.filePath };
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("p4-merge-view");

        if (this.filePath) {
            await this.loadMerge();
        } else {
            this.renderEmpty(container);
        }
    }

    async onClose(): Promise<void> {
        this.destroyEditors();
    }

    private destroyEditors(): void {
        if (this.resultEditor) {
            this.resultEditor.destroy();
            this.resultEditor = null;
        }
        if (this.theirsEditor) {
            this.theirsEditor.destroy();
            this.theirsEditor = null;
        }
        if (this.yoursEditor) {
            this.yoursEditor.destroy();
            this.yoursEditor = null;
        }
    }

    /**
     * Load merge data for the current file
     */
    private async loadMerge(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        this.destroyEditors();

        if (!this.filePath) {
            this.renderEmpty(container);
            return;
        }

        if (!this.plugin.p4Ready) {
            this.renderError(container, "Perforce is not connected");
            return;
        }

        try {
            this.versions = await this.plugin.p4Manager.getConflictVersions(this.filePath);
            this.renderMerge(container);
        } catch (error) {
            this.renderError(container, (error as Error).message);
        }
    }

    /**
     * Render the three-way merge view
     */
    private renderMerge(container: HTMLElement): void {
        if (!this.versions) return;

        // Header with title and actions
        const header = container.createDiv({ cls: "p4-merge-header" });
        
        const titleEl = header.createDiv({ cls: "p4-merge-title" });
        const iconEl = titleEl.createSpan({ cls: "p4-merge-icon" });
        setIcon(iconEl, "git-merge");
        titleEl.createSpan({ text: `Resolving: ${this.filePath}` });

        // Quick action buttons
        const quickActions = header.createDiv({ cls: "p4-merge-quick-actions" });

        this.createActionButton(quickActions, "Accept yours", "user", () => {
            void this.resolveWith("accept-yours");
        });

        this.createActionButton(quickActions, "Accept theirs", "cloud", () => {
            void this.resolveWith("accept-theirs");
        });

        this.createActionButton(quickActions, "Auto-merge", "wand", () => {
            void this.resolveWith("accept-safe-merge");
        });

        // Two-column layout: left shows theirs/yours, right shows result
        const mainContent = container.createDiv({ cls: "p4-merge-content" });

        // Left side: Theirs and Yours panels
        const leftSide = mainContent.createDiv({ cls: "p4-merge-sources" });

        // Theirs panel
        const theirsPanel = leftSide.createDiv({ cls: "p4-merge-panel" });
        const theirsHeader = theirsPanel.createDiv({ cls: "p4-merge-panel-header" });
        theirsHeader.createSpan({ text: "Theirs (depot version)", cls: "p4-merge-panel-title" });
        const useTheirsBtn = theirsHeader.createEl("button", { cls: "p4-merge-use-btn", text: "Use this" });
        useTheirsBtn.addEventListener("click", () => this.useVersion("theirs"));
        const theirsContent = theirsPanel.createDiv({ cls: "p4-merge-panel-content" });
        this.theirsEditor = this.createReadonlyEditor(theirsContent, this.versions.theirs);

        // Yours panel
        const yoursPanel = leftSide.createDiv({ cls: "p4-merge-panel" });
        const yoursHeader = yoursPanel.createDiv({ cls: "p4-merge-panel-header" });
        yoursHeader.createSpan({ text: "Yours (local version)", cls: "p4-merge-panel-title" });
        const useYoursBtn = yoursHeader.createEl("button", { cls: "p4-merge-use-btn", text: "Use this" });
        useYoursBtn.addEventListener("click", () => this.useVersion("yours"));
        const yoursContent = yoursPanel.createDiv({ cls: "p4-merge-panel-content" });
        this.yoursEditor = this.createReadonlyEditor(yoursContent, this.versions.yours);

        // Right side: Result (editable)
        const rightSide = mainContent.createDiv({ cls: "p4-merge-result" });
        const resultHeader = rightSide.createDiv({ cls: "p4-merge-panel-header" });
        resultHeader.createSpan({ text: "Result (editable)", cls: "p4-merge-panel-title" });
        
        const saveResolveBtn = resultHeader.createEl("button", { 
            cls: "mod-cta p4-merge-save-btn", 
            text: "Save & resolve" 
        });
        saveResolveBtn.addEventListener("click", () => { void this.saveAndResolve(); });

        const resultContent = rightSide.createDiv({ cls: "p4-merge-result-content" });
        
        // Start with "yours" as the default result (user's local changes)
        this.resultEditor = this.createEditableEditor(resultContent, this.versions.yours);
    }

    /**
     * Create a read-only editor for viewing versions
     */
    private createReadonlyEditor(container: HTMLElement, content: string): EditorView {
        const extensions = [
            lineNumbers(),
            drawSelection(),
            EditorState.readOnly.of(true),
            EditorView.theme({
                "&": { height: "100%" },
                ".cm-scroller": { overflow: "auto" },
                ".cm-content": { 
                    fontFamily: "var(--font-monospace)",
                    fontSize: "12px",
                },
                ".cm-gutters": {
                    backgroundColor: "var(--background-secondary)",
                    color: "var(--text-faint)",
                    border: "none",
                },
            }),
        ];

        return new EditorView({
            state: EditorState.create({
                doc: content,
                extensions,
            }),
            parent: container,
        });
    }

    /**
     * Create an editable editor for the merge result
     */
    private createEditableEditor(container: HTMLElement, content: string): EditorView {
        const extensions = [
            lineNumbers(),
            drawSelection(),
            highlightActiveLine(),
            EditorView.theme({
                "&": { height: "100%" },
                ".cm-scroller": { overflow: "auto" },
                ".cm-content": { 
                    fontFamily: "var(--font-monospace)",
                    fontSize: "12px",
                },
                ".cm-gutters": {
                    backgroundColor: "var(--background-secondary)",
                    color: "var(--text-faint)",
                    border: "none",
                },
                ".cm-activeLine": {
                    backgroundColor: "var(--background-modifier-hover)",
                },
            }),
        ];

        return new EditorView({
            state: EditorState.create({
                doc: content,
                extensions,
            }),
            parent: container,
        });
    }

    /**
     * Create an action button
     */
    private createActionButton(
        container: HTMLElement, 
        label: string, 
        icon: string, 
        onClick: () => void
    ): HTMLButtonElement {
        const btn = container.createEl("button", { cls: "p4-merge-action-btn" });
        const iconEl = btn.createSpan({ cls: "p4-merge-action-icon" });
        setIcon(iconEl, icon);
        btn.createSpan({ text: label });
        btn.addEventListener("click", onClick);
        return btn;
    }

    /**
     * Use a specific version as the result
     */
    private useVersion(version: "theirs" | "yours"): void {
        if (!this.versions || !this.resultEditor) return;

        const content = version === "theirs" ? this.versions.theirs : this.versions.yours;
        
        this.resultEditor.dispatch({
            changes: {
                from: 0,
                to: this.resultEditor.state.doc.length,
                insert: content,
            },
        });
    }

    /**
     * Resolve with a quick action
     */
    private async resolveWith(action: P4ResolveAction): Promise<void> {
        try {
            await this.plugin.p4Manager.resolve(this.filePath, action);
            this.plugin.displayMessage(`Resolved: ${this.filePath.split("/").pop()}`);
            this.plugin.app.workspace.trigger("obsidian-p4:refresh-now");
            
            // Close this view
            this.leaf.detach();
        } catch (error) {
            this.plugin.displayError(error);
        }
    }

    /**
     * Save the edited result and resolve
     */
    private async saveAndResolve(): Promise<void> {
        if (!this.resultEditor) return;

        const mergedContent = this.resultEditor.state.doc.toString();

        try {
            await this.plugin.p4Manager.resolve(this.filePath, "accept-merged", mergedContent);
            this.plugin.displayMessage(`Resolved with edits: ${this.filePath.split("/").pop()}`);
            this.plugin.app.workspace.trigger("obsidian-p4:refresh-now");
            
            // Close this view
            this.leaf.detach();
        } catch (error) {
            this.plugin.displayError(error);
        }
    }

    /**
     * Render empty state
     */
    private renderEmpty(container: HTMLElement): void {
        const empty = container.createDiv({ cls: "p4-empty-state" });
        empty.createEl("p", { text: "No file selected for merge" });
    }

    /**
     * Render error state
     */
    private renderError(container: HTMLElement, message: string): void {
        const error = container.createDiv({ cls: "p4-error-state" });
        error.createEl("p", { text: "Error loading merge data" });
        error.createEl("p", { text: message, cls: "p4-muted" });
    }
}

