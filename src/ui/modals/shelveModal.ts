import { App, Modal, Setting } from "obsidian";
import type ObsidianP4 from "../../main";
import type { P4Changelist } from "../../types";

/**
 * Modal for selecting a changelist to shelve
 */
export class ShelveModal extends Modal {
    private plugin: ObsidianP4;
    private changelists: P4Changelist[] = [];
    private result: number | null = null;
    private resolvePromise: ((value: number | null) => void) | null = null;

    constructor(app: App, plugin: ObsidianP4) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-shelve-modal");

        contentEl.createEl("h2", { text: "Shelve changes" });
        contentEl.createEl("p", { 
            text: "Select a numbered changelist to shelve. The default changelist cannot be shelved directly",
            cls: "p4-muted"
        });

        // Load changelists
        try {
            const allChangelists = await this.plugin.p4Manager.getPendingChangelists();
            // Filter out default changelist - can't shelve default directly
            this.changelists = allChangelists.filter(cl => cl.change !== "default");
        } catch (error) {
            contentEl.createEl("p", {
                text: `Error loading changelists: ${(error as Error).message}`,
                cls: "p4-error",
            });
            return;
        }

        if (this.changelists.length === 0) {
            contentEl.createEl("p", { 
                text: "No numbered changelists found. Create a changelist first to shelve changes.",
                cls: "p4-warning"
            });
            
            new Setting(contentEl)
                .addButton(button => {
                    button
                        .setButtonText("Close")
                        .onClick(() => this.close());
                });
            return;
        }

        const listContainer = contentEl.createDiv({ cls: "p4-changelist-list" });

        for (const cl of this.changelists) {
            const item = listContainer.createDiv({ cls: "p4-changelist-item" });
            
            new Setting(item)
                .setName(`Changelist ${cl.change}`)
                .setDesc(cl.description || "(no description)")
                .addButton(button => {
                    button
                        .setButtonText("Shelve")
                        .setCta()
                        .onClick(() => {
                            this.result = cl.change as number;
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
     * Open the modal and return the selected changelist number
     */
    openAndGetResult(): Promise<number | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

/**
 * Modal for unshelving changes
 */
export class UnshelveModal extends Modal {
    private plugin: ObsidianP4;
    private result: { sourceChangelist: number; targetChangelist: number | "default" } | null = null;
    private resolvePromise: ((value: { sourceChangelist: number; targetChangelist: number | "default" } | null) => void) | null = null;

    constructor(app: App, plugin: ObsidianP4) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("p4-unshelve-modal");

        contentEl.createEl("h2", { text: "Unshelve changes" });

        let sourceChangelist = 0;
        let targetChangelist: number | "default" = "default";

        new Setting(contentEl)
            .setName("Shelved changelist number")
            .setDesc("Enter the changelist number containing shelved files")
            .addText(text => {
                text.inputEl.type = "number";
                text.setPlaceholder(`${"e.g."} 12345`)
                    .onChange(value => {
                        sourceChangelist = parseInt(value, 10) || 0;
                    });
            });

        new Setting(contentEl)
            .setName("Target changelist")
            .setDesc("Where to unshelve the files (leave empty for default)")
            .addText(text => {
                text.setPlaceholder("Default or changelist number")
                    .onChange(value => {
                        if (value === "" || value.toLowerCase() === "default") {
                            targetChangelist = "default";
                        } else {
                            const num = parseInt(value, 10);
                            targetChangelist = isNaN(num) ? "default" : num;
                        }
                    });
            });

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText("Unshelve")
                    .setCta()
                    .onClick(() => {
                        if (sourceChangelist > 0) {
                            this.result = { sourceChangelist, targetChangelist };
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
     * Open the modal and return the unshelve parameters
     */
    openAndGetResult(): Promise<{ sourceChangelist: number; targetChangelist: number | "default" } | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

