import { App, Modal, moment } from "obsidian";
import { mount, unmount } from "svelte";
import type ObsidianP4 from "../../main";
import SubmitModalContent from "../svelte/modals/SubmitModalContent.svelte";

/**
 * Modal for entering a submit description
 */
export class SubmitModal extends Modal {
    private plugin: ObsidianP4;
    private result: string | null = null;
    private resolvePromise: ((value: string | null) => void) | null = null;
    private svelteComponent: ReturnType<typeof mount> | null = null;

    constructor(app: App, plugin: ObsidianP4) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-submit-modal");

        // Get default message from template
        let defaultMessage = this.plugin.settings.submitMessageTemplate;
        defaultMessage = defaultMessage.replace("{{date}}", moment().format("YYYY-MM-DD HH:mm:ss"));

        this.svelteComponent = mount(SubmitModalContent, {
            target: contentEl,
            props: {
                defaultMessage,
                onSubmit: (description: string) => {
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
            void unmount(this.svelteComponent);
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
