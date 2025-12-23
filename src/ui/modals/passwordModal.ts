import { App, Modal, Setting } from "obsidian";

/**
 * Modal for entering P4 password when login expires
 */
export class PasswordModal extends Modal {
    private message: string;
    private result: string | null = null;
    private resolvePromise: ((value: string | null) => void) | null = null;

    constructor(app: App, message?: string) {
        super(app);
        this.message = message || "Your Perforce session has expired. Please enter your password to log in.";
    }

    onOpen(): void {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Perforce login" });
        contentEl.createEl("p", { text: this.message, cls: "p4-password-message" });

        let password = "";

        new Setting(contentEl)
            .setName("Password")
            .addText((text) => {
                // Make it a password field
                text.inputEl.type = "password";
                text.inputEl.placeholder = `Enter your ${"P4"} password...`;
                text.onChange((value) => {
                    password = value;
                });
                
                // Focus
                setTimeout(() => {
                    text.inputEl.focus();
                }, 50);
                
                // Handle enter key
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        this.result = password;
                        this.close();
                    }
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Login")
                    .setCta()
                    .onClick(() => {
                        this.result = password;
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

        if (this.resolvePromise) {
            this.resolvePromise(this.result);
        }
    }

    /**
     * Open the modal and return the password (or null if cancelled)
     */
    openAndGetResult(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

