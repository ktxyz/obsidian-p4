import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import type ObsidianP4 from "../main";
import { DIFF_VIEW_CONFIG } from "../constants";
import type { P4DiffResult } from "../types";

interface DiffViewState extends Record<string, unknown> {
    filePath: string;
}

/**
 * View for displaying side-by-side file diffs using CodeMirror MergeView
 */
export class P4DiffView extends ItemView {
    private plugin: ObsidianP4;
    private filePath: string = "";
    private diffResult: P4DiffResult | null = null;
    private mergeView: MergeView | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianP4) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DIFF_VIEW_CONFIG.type;
    }

    getDisplayText(): string {
        if (this.filePath) {
            const fileName = this.filePath.split("/").pop() || this.filePath;
            return `Diff: ${fileName}`;
        }
        return DIFF_VIEW_CONFIG.name;
    }

    getIcon(): string {
        return DIFF_VIEW_CONFIG.icon;
    }

    async setState(state: DiffViewState, result: any): Promise<void> {
        this.filePath = state.filePath || "";
        await this.loadDiff();
        await super.setState(state, result);
    }

    getState(): DiffViewState {
        return { filePath: this.filePath };
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("p4-diff-view");

        if (this.filePath) {
            await this.loadDiff();
        } else {
            this.renderEmpty(container as HTMLElement);
        }
    }

    async onClose(): Promise<void> {
        // Cleanup MergeView
        if (this.mergeView) {
            this.mergeView.destroy();
            this.mergeView = null;
        }
    }

    /**
     * Load diff for the current file
     */
    private async loadDiff(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();

        // Cleanup existing MergeView
        if (this.mergeView) {
            this.mergeView.destroy();
            this.mergeView = null;
        }

        if (!this.filePath) {
            this.renderEmpty(container);
            return;
        }

        if (!this.plugin.p4Ready) {
            this.renderError(container, "Perforce is not connected");
            return;
        }

        try {
            this.diffResult = await this.plugin.p4Manager.diff(this.filePath);
            this.renderDiff(container);
        } catch (error) {
            this.renderError(container, (error as Error).message);
        }
    }

    /**
     * Render the side-by-side diff view
     */
    private renderDiff(container: HTMLElement): void {
        if (!this.diffResult) return;

        // Header
        const header = container.createDiv({ cls: "p4-diff-header" });
        
        const titleEl = header.createDiv({ cls: "p4-diff-title" });
        const iconEl = titleEl.createSpan({ cls: "p4-diff-icon" });
        setIcon(iconEl, "file-diff");
        titleEl.createSpan({ text: this.filePath });

        // Actions
        const actions = header.createDiv({ cls: "p4-diff-actions" });
        
        const refreshBtn = actions.createEl("button", { 
            cls: "p4-action-button",
            attr: { "aria-label": "Refresh" }
        });
        setIcon(refreshBtn, "refresh-cw");
        refreshBtn.addEventListener("click", () => this.loadDiff());

        const openBtn = actions.createEl("button", {
            cls: "p4-action-button",
            attr: { "aria-label": "Open file" }
        });
        setIcon(openBtn, "file");
        openBtn.addEventListener("click", () => {
            const tFile = this.app.vault.getAbstractFileByPath(this.filePath);
            if (tFile) {
                this.app.workspace.getLeaf("tab").openFile(tFile as any);
            }
        });

        // Labels for sides
        const labelsEl = header.createDiv({ cls: "p4-diff-labels" });
        labelsEl.createSpan({ text: "Depot (original)", cls: "p4-diff-label-left" });
        labelsEl.createSpan({ text: "Local (modified)", cls: "p4-diff-label-right" });

        // Diff content container
        const content = container.createDiv({ cls: "p4-diff-content" });

        const depotContent = this.diffResult.depotContent || "";
        const localContent = this.diffResult.localContent || "";

        // Check if there are no differences
        if (depotContent === localContent) {
            content.createDiv({ cls: "p4-diff-empty" }).createEl("p", { 
                text: "No differences (file matches depot version)" 
            });
            return;
        }

        // Create MergeView
        this.createMergeView(content, depotContent, localContent);
    }

    /**
     * Create CodeMirror MergeView for side-by-side diff
     */
    private createMergeView(container: HTMLElement, original: string, modified: string): void {
        const editorContainer = container.createDiv({ cls: "p4-merge-view-container" });

        // Common extensions for both editors
        const baseExtensions = [
            lineNumbers(),
            drawSelection(),
            highlightActiveLine(),
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
                ".cm-lineNumbers .cm-gutterElement": {
                    paddingLeft: "8px",
                    paddingRight: "8px",
                },
                // Diff highlighting
                ".cm-changedLine": {
                    backgroundColor: "rgba(var(--color-yellow-rgb), 0.1)",
                },
                ".cm-deletedChunk": {
                    backgroundColor: "rgba(var(--color-red-rgb), 0.15)",
                },
                ".cm-insertedChunk": {
                    backgroundColor: "rgba(var(--color-green-rgb), 0.15)",
                },
            }),
        ];

        try {
            this.mergeView = new MergeView({
                a: {
                    doc: original,
                    extensions: baseExtensions,
                },
                b: {
                    doc: modified,
                    extensions: baseExtensions,
                },
                parent: editorContainer,
                collapseUnchanged: { margin: 3, minSize: 4 },
                gutter: true,
            });
        } catch (error) {
            console.error("Failed to create MergeView:", error);
            // Fallback to basic text display
            this.renderFallbackDiff(container, original, modified);
        }
    }

    /**
     * Fallback diff rendering if MergeView fails
     */
    private renderFallbackDiff(container: HTMLElement, original: string, modified: string): void {
        container.empty();
        const fallback = container.createDiv({ cls: "p4-diff-fallback" });
        
        const leftPane = fallback.createDiv({ cls: "p4-diff-pane" });
        leftPane.createEl("h4", { text: "Depot (original)" });
        leftPane.createEl("pre").createEl("code").setText(original);

        const rightPane = fallback.createDiv({ cls: "p4-diff-pane" });
        rightPane.createEl("h4", { text: "Local (modified)" });
        rightPane.createEl("pre").createEl("code").setText(modified);
    }

    /**
     * Render empty state
     */
    private renderEmpty(container: HTMLElement): void {
        const empty = container.createDiv({ cls: "p4-empty-state" });
        empty.createEl("p", { text: "No file selected for diff" });
    }

    /**
     * Render error state
     */
    private renderError(container: HTMLElement, message: string): void {
        const error = container.createDiv({ cls: "p4-error-state" });
        error.createEl("p", { text: "Error loading diff" });
        error.createEl("p", { text: message, cls: "p4-muted" });
    }
}
