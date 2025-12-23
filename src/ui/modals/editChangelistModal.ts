import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type ObsidianP4 from "../../main";
import EditChangelistContent from "../svelte/modals/EditChangelistContent.svelte";

/**
 * Modal for editing a changelist's description or creating a new one
 */
export class EditChangelistModal extends Modal {
    private plugin: ObsidianP4;
    private changelist: number;
    private currentDescription: string;
    private result: string | null = null;
    private resolvePromise: ((value: string | null) => void) | null = null;
    private svelteComponent: ReturnType<typeof mount> | null = null;

    constructor(app: App, plugin: ObsidianP4, changelist: number, currentDescription: string) {
        super(app);
        this.plugin = plugin;
        this.changelist = changelist;
        this.currentDescription = currentDescription;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-edit-changelist-modal");

        this.svelteComponent = mount(EditChangelistContent, {
            target: contentEl,
            props: {
                changelist: this.changelist,
                initialDescription: this.currentDescription,
                onSave: (description: string) => {
                    this.result = description;
                    this.close();
                },
                onCancel: () => {
                    this.result = null;
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
    openAndGetResult(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}
