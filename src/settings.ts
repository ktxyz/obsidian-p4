import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ObsidianP4 from "./main";
import { DEFAULT_SETTINGS } from "./constants";
import type { P4PluginSettings } from "./types";

export { DEFAULT_SETTINGS };
export type { P4PluginSettings };

/**
 * Settings tab for the Perforce plugin
 */
export class P4SettingsTab extends PluginSettingTab {
    plugin: ObsidianP4;

    constructor(app: App, plugin: ObsidianP4) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Connection section
        new Setting(containerEl)
            .setName("Connection")
            .setHeading();

        new Setting(containerEl)
            .setName("P4 executable path")
            .setDesc("Path to the p4 executable. Leave empty to use p4 from PATH.")
            .addText(text => text
                .setPlaceholder("p4")
                .setValue(this.plugin.settings.p4Path)
                .onChange(async (value) => {
                    this.plugin.settings.p4Path = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Server address (P4PORT)")
            .setDesc("Perforce server address, e.g., perforce.server.com:1666. Leave empty to use system P4PORT.")
            .addText(text => text
                .setPlaceholder("server:1666")
                .setValue(this.plugin.settings.p4Port)
                .onChange(async (value) => {
                    this.plugin.settings.p4Port = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Username (P4USER)")
            .setDesc("Perforce username. Leave empty to use system P4USER.")
            .addText(text => text
                .setPlaceholder("username")
                .setValue(this.plugin.settings.p4User)
                .onChange(async (value) => {
                    this.plugin.settings.p4User = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Workspace (P4CLIENT)")
            .setDesc("Perforce client/workspace name. Leave empty to use system P4CLIENT.")
            .addText(text => text
                .setPlaceholder("my-workspace")
                .setValue(this.plugin.settings.p4Client)
                .onChange(async (value) => {
                    this.plugin.settings.p4Client = value;
                    await this.plugin.saveSettings();
                }));

        // Test connection button
        new Setting(containerEl)
            .setName("Test connection")
            .setDesc("Test the Perforce connection with current settings.")
            .addButton(button => button
                .setButtonText("Test connection")
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText("Testing...");
                    try {
                        await this.plugin.reinitialize();
                        if (this.plugin.p4Ready) {
                            button.setButtonText("✓ Connected!");
                            // Refresh the display to show connection info
                            this.display();
                        } else {
                            button.setButtonText("✗ Failed");
                        }
                    } catch (error) {
                        button.setButtonText("✗ Error");
                        console.error("Connection test failed:", error);
                    }
                    setTimeout(() => {
                        button.setDisabled(false);
                        button.setButtonText("Test connection");
                    }, 2000);
                }));

        // Auto-checkout section
        new Setting(containerEl)
            .setName("Editing")
            .setHeading();

        new Setting(containerEl)
            .setName("Auto-checkout")
            .setDesc("Automatically check out files when you start editing them.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoCheckout)
                .onChange(async (value) => {
                    this.plugin.settings.autoCheckout = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Auto-add new files")
            .setDesc("Automatically add new files to Perforce when created.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoAddNewFiles)
                .onChange(async (value) => {
                    this.plugin.settings.autoAddNewFiles = value;
                    await this.plugin.saveSettings();
                }));

        // Sync section
        new Setting(containerEl)
            .setName("Sync")
            .setHeading();

        new Setting(containerEl)
            .setName("Sync on startup")
            .setDesc("Automatically sync files when the plugin loads.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));

        // Submit section
        new Setting(containerEl)
            .setName("Submit")
            .setHeading();

        new Setting(containerEl)
            .setName("Default submit message")
            .setDesc("Template for submit messages. Use {{date}} for current date.")
            .addText(text => text
                .setPlaceholder("vault update: {{date}}")
                .setValue(this.plugin.settings.submitMessageTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.submitMessageTemplate = value;
                    await this.plugin.saveSettings();
                }));

        // UI section
        new Setting(containerEl)
            .setName("Interface")
            .setHeading();

        new Setting(containerEl)
            .setName("Show status bar")
            .setDesc("Show Perforce status in the status bar.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showStatusBar)
                .onChange(async (value) => {
                    this.plugin.settings.showStatusBar = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        this.plugin.enableStatusBar();
                    } else {
                        this.plugin.disableStatusBar();
                    }
                }));

        new Setting(containerEl)
            .setName("Show notifications")
            .setDesc("Show popup notifications for P4 operations.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showNotices)
                .onChange(async (value) => {
                    this.plugin.settings.showNotices = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Auto-refresh source control")
            .setDesc("Automatically refresh the source control view when files change.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.refreshSourceControl)
                .onChange(async (value) => {
                    this.plugin.settings.refreshSourceControl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Refresh interval (ms)")
            .setDesc("How often to refresh the source control view (in milliseconds).")
            .addText(text => {
                text.inputEl.type = "number";
                text.setPlaceholder("5000")
                    .setValue(this.plugin.settings.refreshInterval.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value, 10);
                        if (!isNaN(num) && num >= 1000) {
                            this.plugin.settings.refreshInterval = num;
                            await this.plugin.saveSettings();
                        }
                    });
            });

        new Setting(containerEl)
            .setName("Show inline blame")
            .setDesc("Show blame annotation (author, changelist) for the current line in the editor.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showInlineBlame)
                .onChange(async (value) => {
                    this.plugin.settings.showInlineBlame = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Clear blame cache")
            .setDesc("Clear cached blame data for all files. Blame will be re-fetched on next request.")
            .addButton(button => button
                .setButtonText("Clear cache")
                .onClick(() => {
                    this.plugin.clearBlameCache();
                    new Notice("Blame cache cleared");
                }));

        // Info section
        new Setting(containerEl)
            .setName("Connection info")
            .setHeading();

        this.displayConnectionInfo(containerEl);
    }

    private async displayConnectionInfo(containerEl: HTMLElement): Promise<void> {
        const infoContainer = containerEl.createDiv({ cls: "p4-connection-info" });

        if (!this.plugin.p4Ready) {
            infoContainer.createEl("p", {
                text: "⚠️ Perforce is not connected. Check that p4 is installed and you're in a valid workspace.",
                cls: "p4-warning",
            });
            return;
        }

        try {
            const info = await this.plugin.p4Manager.getInfo();
            
            const table = infoContainer.createEl("table", { cls: "p4-info-table" });
            
            const rows = [
                ["User", info.userName],
                ["Client", info.clientName],
                ["Server", info.serverAddress],
                ["Root", info.clientRoot],
            ];

            for (const [label, value] of rows) {
                const row = table.createEl("tr");
                row.createEl("td", { text: label, cls: "p4-info-label" });
                row.createEl("td", { text: value, cls: "p4-info-value" });
            }
        } catch (error) {
            infoContainer.createEl("p", {
                text: `Error getting P4 info: ${(error as Error).message}`,
                cls: "p4-error",
            });
        }
    }
}
