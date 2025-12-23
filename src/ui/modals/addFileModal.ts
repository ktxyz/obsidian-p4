import { App, Modal, TFile } from "obsidian";
import type ObsidianP4 from "../../main";
import { mount, unmount } from "svelte";
import AddFileModalComponent from "../svelte/modals/AddFileModal.svelte";

export type AddFileResult = "add" | "skip" | "skip-session" | "cancel";

/**
 * Modal for prompting user to add a new file to Perforce
 */
export class AddFileModal extends Modal {
    private plugin: ObsidianP4;
    private file: TFile;
    private result: AddFileResult = "cancel";
    private resolvePromise: ((value: AddFileResult) => void) | null = null;
    private svelteComponent: ReturnType<typeof mount> | null = null;

    constructor(app: App, plugin: ObsidianP4, file: TFile) {
        super(app);
        this.plugin = plugin;
        this.file = file;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-add-file-modal");

        this.svelteComponent = mount(AddFileModalComponent, {
            target: contentEl,
            props: {
                fileName: this.file.name,
                filePath: this.file.path,
                onAdd: () => {
                    this.result = "add";
                    this.close();
                },
                onSkip: () => {
                    this.result = "skip";
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
    openAndGetResult(): Promise<AddFileResult> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

