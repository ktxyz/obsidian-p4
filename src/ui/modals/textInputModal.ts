import { App, Modal, Setting } from "obsidian";

/**
 * Simple modal for text input
 */
export class TextInputModal extends Modal {
    private title: string;
    private placeholder: string;
    private defaultValue: string;
    private onSubmit: (result: string | null) => void;
    private result: string | null = null;

    constructor(
        app: App,
        title: string,
        placeholder: string,
        defaultValue: string,
        onSubmit: (result: string | null) => void
    ) {
        super(app);
        this.title = title;
        this.placeholder = placeholder;
        this.defaultValue = defaultValue;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: this.title });

        let inputValue = this.defaultValue;

        new Setting(contentEl)
            .setName(this.placeholder)
            .addText((text) => {
                text.setValue(this.defaultValue)
                    .onChange((value) => {
                        inputValue = value;
                    });
                
                // Focus and select text
                setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                }, 50);
                
                // Handle enter key
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        this.result = inputValue;
                        this.close();
                    }
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("OK")
                    .setCta()
                    .onClick(() => {
                        this.result = inputValue;
                        this.close();
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.result = null;
                        this.close();
                    })
            );
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.onSubmit(this.result);
    }
}

