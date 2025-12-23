import { ItemView, WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import type ObsidianP4 from "../main";
import { SOURCE_CONTROL_VIEW_CONFIG } from "../constants";
import type { P4Changelist, P4ConflictFile, P4FileStatus } from "../types";
import SourceControlViewComponent from "./svelte/SourceControlView.svelte";
import { SubmitModal } from "./modals/submitModal";

/**
 * Source control sidebar view showing pending changes
 */
export class P4SourceControlView extends ItemView {
    private plugin: ObsidianP4;
    private svelteComponent: ReturnType<typeof mount> | null = null;
    private changelists: P4Changelist[] = [];
    private openedFiles: P4FileStatus[] = [];
    private conflicts: P4ConflictFile[] = [];
    private error: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianP4) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return SOURCE_CONTROL_VIEW_CONFIG.type;
    }

    getDisplayText(): string {
        return SOURCE_CONTROL_VIEW_CONFIG.name;
    }

    getIcon(): string {
        return SOURCE_CONTROL_VIEW_CONFIG.icon;
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("p4-source-control-view");

        this.mountSvelte(container);

        // Register for status changes
        this.registerEvent(
            this.app.workspace.on("obsidian-p4:status-changed", (files: P4FileStatus[]) => {
                this.openedFiles = files;
                // Also refresh changelists to keep everything in sync
                void this.plugin.p4Manager.getPendingChangelists()
                    .then((changelists) => {
                        this.changelists = changelists;
                        this.error = null;
                        this.updateSvelte(container);
                    })
                    .catch((err: Error) => {
                        console.error("Failed to get changelists:", err);
                        this.error = err.message;
                        this.updateSvelte(container);
                    });
            })
        );

        // Initial load
        await this.refresh();
    }

    async onClose(): Promise<void> {
        if (this.svelteComponent) {
            void unmount(this.svelteComponent);
            this.svelteComponent = null;
        }
    }

    private mountSvelte(container: HTMLElement): void {
        if (this.svelteComponent) {
            void unmount(this.svelteComponent);
        }

        this.svelteComponent = mount(SourceControlViewComponent, {
            target: container,
            props: {
                plugin: this.plugin,
                openedFiles: this.openedFiles,
                changelists: this.changelists,
                conflicts: this.conflicts,
                isConnected: this.plugin.p4Ready,
                error: this.error,
                onRefresh: () => this.refresh(),
                onSync: () => this.sync(),
                onSubmit: () => this.submit(),
            },
        });
    }

    private updateSvelte(container: HTMLElement): void {
        // Svelte 5 doesn't have a direct way to update props externally,
        // so we remount the component with new props
        this.mountSvelte(container);
    }

    /**
     * Refresh the view
     */
    async refresh(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        
        if (!this.plugin.p4Ready) {
            this.error = null;
            this.openedFiles = [];
            this.changelists = [];
            this.conflicts = [];
            this.updateSvelte(container);
            return;
        }

        try {
            this.openedFiles = await this.plugin.p4Manager.getOpenedFiles();
            this.changelists = await this.plugin.p4Manager.getPendingChangelists();
            this.conflicts = await this.plugin.p4Manager.getConflicts();
            this.error = null;
        } catch (err) {
            this.error = (err as Error).message;
        }

        this.updateSvelte(container);
    }

    /**
     * Sync files
     */
    private async sync(): Promise<void> {
        if (!this.plugin.p4Ready) return;

        try {
            this.plugin.displayMessage("Syncing...");
            const result = await this.plugin.p4Manager.sync();
            if (result.files.length > 0) {
                this.plugin.displayMessage(`Synced ${result.files.length} file(s)`);
            } else {
                this.plugin.displayMessage("Already up to date");
            }
            await this.refresh();
        } catch (err) {
            this.plugin.displayError(err);
        }
    }

    /**
     * Submit default changelist
     */
    private async submit(): Promise<void> {
        if (!this.plugin.p4Ready) return;

        const modal = new SubmitModal(this.app, this.plugin);
        const description = await modal.openAndGetResult();

        if (description) {
            try {
                this.plugin.displayMessage("Submitting...");
                const changeNum = await this.plugin.p4Manager.submit("default", description);
                this.plugin.displayMessage(`Submitted changelist ${changeNum}`);
                await this.refresh();
                this.plugin.app.workspace.trigger("obsidian-p4:refresh-now");
            } catch (err) {
                this.plugin.displayError(err);
            }
        }
    }
}
