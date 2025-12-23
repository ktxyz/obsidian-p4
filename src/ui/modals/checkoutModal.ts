import { App, Modal, TFile } from "obsidian";
import type ObsidianP4 from "../../main";
import { mount, unmount } from "svelte";
import CheckoutModalComponent from "../svelte/modals/CheckoutModal.svelte";

export type CheckoutResult = "checkout" | "checkout-lock" | "skip" | "skip-session" | "cancel";

/**
 * Modal for prompting user to checkout a file before editing
 */
export class CheckoutModal extends Modal {
    private plugin: ObsidianP4;
    private file: TFile;
    private result: CheckoutResult = "cancel";
    private resolvePromise: ((value: CheckoutResult) => void) | null = null;
    private svelteComponent: ReturnType<typeof mount> | null = null;

    constructor(app: App, plugin: ObsidianP4, file: TFile) {
        super(app);
        this.plugin = plugin;
        this.file = file;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-checkout-modal");

        this.svelteComponent = mount(CheckoutModalComponent, {
            target: contentEl,
            props: {
                fileName: this.file.name,
                filePath: this.file.path,
                onCheckout: () => {
                    this.result = "checkout";
                    this.close();
                },
                onCheckoutLock: () => {
                    this.result = "checkout-lock";
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
    openAndGetResult(): Promise<CheckoutResult> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}
