import { App, Modal } from "obsidian";
import type ObsidianP4 from "../../main";
import { mount, unmount } from "svelte";
import DeleteFileModalComponent from "../svelte/modals/DeleteFileModal.svelte";

export type DeleteFileResult = "delete" | "keep" | "skip-session" | "cancel";

/**
 * Modal for prompting user to delete a file from Perforce when it's deleted locally
 */
export class DeleteFileModal extends Modal {
    private plugin: ObsidianP4;
    private filePath: string;
    private fileName: string;
    private result: DeleteFileResult = "cancel";
    private resolvePromise: ((value: DeleteFileResult) => void) | null = null;
    private svelteComponent: ReturnType<typeof mount> | null = null;

    constructor(app: App, plugin: ObsidianP4, filePath: string) {
        super(app);
        this.plugin = plugin;
        this.filePath = filePath;
        this.fileName = filePath.split("/").pop() || filePath;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-delete-file-modal");

        this.svelteComponent = mount(DeleteFileModalComponent, {
            target: contentEl,
            props: {
                fileName: this.fileName,
                filePath: this.filePath,
                onDelete: () => {
                    this.result = "delete";
                    this.close();
                },
                onKeep: () => {
                    this.result = "keep";
                    this.close();
                },
                onSkipSession: () => {
                    this.result = "skip-session";
                    this.close();
                },
                onClose: () => {
                    this.result = "cancel";
                    this.close();
                },
            },
        });
    }

    onClose(): void {
        if (this.svelteComponent) {
            unmount(this.svelteComponent);
            this.svelteComponent = null;
        }
        
        const { contentEl } = this;
        contentEl.empty();

        if (this.resolvePromise) {
            this.resolvePromise(this.result);
        }
    }

    /**
     * Open the modal and return the result
     */
    openAndGetResult(): Promise<DeleteFileResult> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

