import { App, Modal, Setting } from "obsidian";
import type ObsidianP4 from "../../main";
import type { P4Changelist } from "../../types";

/**
 * Modal for selecting a changelist
 */
export class ChangelistModal extends Modal {
    private plugin: ObsidianP4;
    private changelists: P4Changelist[] = [];
    private result: P4Changelist | null = null;
    private resolvePromise: ((value: P4Changelist | null) => void) | null = null;

    constructor(app: App, plugin: ObsidianP4) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-changelist-modal");

        contentEl.createEl("h2", { text: "Select changelist" });

        // Load changelists
        try {
            this.changelists = await this.plugin.p4Manager.getPendingChangelists();
        } catch (error) {
            contentEl.createEl("p", {
                text: `Error loading changelists: ${(error as Error).message}`,
                cls: "p4-error",
            });
            return;
        }

        if (this.changelists.length === 0) {
            contentEl.createEl("p", { text: "No pending changelists found." });
            return;
        }

        const listContainer = contentEl.createDiv({ cls: "p4-changelist-list" });

        for (const cl of this.changelists) {
            const item = listContainer.createDiv({ cls: "p4-changelist-item" });
            
            const label = cl.change === "default" 
                ? "Default changelist" 
                : `Changelist ${cl.change}`;

            new Setting(item)
                .setName(label)
                .setDesc(cl.description || "(no description)")
                .addButton(button => {
                    button
                        .setButtonText("Select")
                        .onClick(() => {
                            this.result = cl;
                            this.close();
                        });
                });
        }

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.result = null;
                        this.close();
                    });
            });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();

        if (this.resolvePromise) {
            this.resolvePromise(this.result);
        }
    }

    /**
     * Open the modal and return the selected changelist
     */
    openAndGetResult(): Promise<P4Changelist | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

/**
 * Modal for creating a new changelist
 */
export class NewChangelistModal extends Modal {
    private result: string | null = null;
    private resolvePromise: ((value: string | null) => void) | null = null;

    constructor(app: App) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-new-changelist-modal");

        contentEl.createEl("h2", { text: "New changelist" });

        let description = "";

        new Setting(contentEl)
            .setName("Description")
            .setDesc("Enter a description for the new changelist")
            .addTextArea(text => {
                text.setPlaceholder("Enter description...")
                    .onChange(value => {
                        description = value;
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
            });

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText("Create")
                    .setCta()
                    .onClick(() => {
                        if (description.trim()) {
                            this.result = description;
                            this.close();
                        }
                    });
            })
            .addButton(button => {
                button
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.result = null;
                        this.close();
                    });
            });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();

        if (this.resolvePromise) {
            this.resolvePromise(this.result);
        }
    }

    /**
     * Open the modal and return the description
     */
    openAndGetResult(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

