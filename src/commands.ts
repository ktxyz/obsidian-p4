import { Notice, TFile } from "obsidian";
import type ObsidianP4 from "./main";
import { SOURCE_CONTROL_VIEW_CONFIG, HISTORY_VIEW_CONFIG } from "./constants";
import { SubmitModal } from "./ui/modals/submitModal";
import { ShelveModal, UnshelveModal } from "./ui/modals/shelveModal";

/**
 * Register all P4 commands
 */
export function registerCommands(plugin: ObsidianP4): void {
    const { app } = plugin;

    // Sync command
    plugin.addCommand({
        id: "p4-sync",
        name: "Sync (get latest)",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            try {
                plugin.displayMessage("Syncing...");
                const result = await plugin.p4Manager.sync();
                if (result.files.length > 0) {
                    plugin.displayMessage(`Synced ${result.files.length} file(s)`);
                } else {
                    plugin.displayMessage("Already up to date");
                }
                app.workspace.trigger("obsidian-p4:refresh-now");
            } catch (error) {
                plugin.displayError(error);
            }
        },
    });

    // Edit (checkout) current file
    plugin.addCommand({
        id: "p4-edit",
        name: "Check out current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.p4Manager.edit(file.path)
                    .then(() => {
                        plugin.displayMessage(`Checked out: ${file.name}`);
                        app.workspace.trigger("obsidian-p4:refresh-now");
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Add current file
    plugin.addCommand({
        id: "p4-add",
        name: "Add current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.p4Manager.add(file.path)
                    .then(() => {
                        plugin.displayMessage(`Added: ${file.name}`);
                        app.workspace.trigger("obsidian-p4:refresh-now");
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Revert current file
    plugin.addCommand({
        id: "p4-revert",
        name: "Revert current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.p4Manager.revert(file.path)
                    .then(() => {
                        plugin.displayMessage(`Reverted: ${file.name}`);
                        app.workspace.trigger("obsidian-p4:refresh-now");
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Submit default changelist
    plugin.addCommand({
        id: "p4-submit",
        name: "Submit default changelist",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            const modal = new SubmitModal(app, plugin);
            const description = await modal.openAndGetResult();

            if (description) {
                try {
                    plugin.displayMessage("Submitting...");
                    const changeNum = await plugin.p4Manager.submit("default", description);
                    plugin.displayMessage(`Submitted changelist ${changeNum}`);
                    app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    plugin.displayError(error);
                }
            }
        },
    });

    // Show opened files
    plugin.addCommand({
        id: "p4-opened",
        name: "Show pending changes",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            // Open the source control view
            const leaves = app.workspace.getLeavesOfType(SOURCE_CONTROL_VIEW_CONFIG.type);
            let leaf = leaves.length > 0 ? leaves[0] : null;
            if (!leaf) {
                leaf = app.workspace.getRightLeaf(false);
                if (!leaf) {
                    leaf = app.workspace.getLeaf(true);
                }
                await leaf.setViewState({
                    type: SOURCE_CONTROL_VIEW_CONFIG.type,
                });
            }
            await app.workspace.revealLeaf(leaf);
            app.workspace.trigger("obsidian-p4:refresh-now");
        },
    });

    // Show diff for current file
    plugin.addCommand({
        id: "p4-diff",
        name: "Show diff for current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.openDiffView(file.path)
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Revert all files
    plugin.addCommand({
        id: "p4-revert-all",
        name: "CAUTION: Revert all changes",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            try {
                await plugin.p4Manager.revertChangelist("default");
                plugin.displayMessage("Reverted all changes");
                app.workspace.trigger("obsidian-p4:refresh-now");
            } catch (error) {
                plugin.displayError(error);
            }
        },
    });

    // Open source control view
    plugin.addCommand({
        id: "p4-open-source-control",
        name: "Open source control view",
        callback: async () => {
            const leaves = app.workspace.getLeavesOfType(SOURCE_CONTROL_VIEW_CONFIG.type);
            let leaf = leaves.length > 0 ? leaves[0] : null;
            if (!leaf) {
                leaf = app.workspace.getRightLeaf(false);
                if (!leaf) {
                    leaf = app.workspace.getLeaf(true);
                }
                await leaf.setViewState({
                    type: SOURCE_CONTROL_VIEW_CONFIG.type,
                });
            }
            await app.workspace.revealLeaf(leaf);
        },
    });

    // Open history view
    plugin.addCommand({
        id: "p4-open-history",
        name: "Open history view",
        callback: async () => {
            const leaves = app.workspace.getLeavesOfType(HISTORY_VIEW_CONFIG.type);
            let leaf = leaves.length > 0 ? leaves[0] : null;
            if (!leaf) {
                leaf = app.workspace.getRightLeaf(false);
                if (!leaf) {
                    leaf = app.workspace.getLeaf(true);
                }
                await leaf.setViewState({
                    type: HISTORY_VIEW_CONFIG.type,
                });
            }
            await app.workspace.revealLeaf(leaf);
        },
    });

    // Shelve command
    plugin.addCommand({
        id: "p4-shelve",
        name: "Shelve changes",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            const modal = new ShelveModal(app, plugin);
            const changelist = await modal.openAndGetResult();

            if (changelist !== null) {
                try {
                    plugin.displayMessage("Shelving...");
                    await plugin.p4Manager.shelve(changelist);
                    plugin.displayMessage(`Shelved changelist ${changelist}`);
                    app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    plugin.displayError(error);
                }
            }
        },
    });

    // Unshelve command
    plugin.addCommand({
        id: "p4-unshelve",
        name: "Unshelve changes",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            const modal = new UnshelveModal(app, plugin);
            const result = await modal.openAndGetResult();

            if (result !== null) {
                try {
                    plugin.displayMessage("Unshelving...");
                    await plugin.p4Manager.unshelve(result.sourceChangelist, result.targetChangelist);
                    plugin.displayMessage(`Unshelved changelist ${result.sourceChangelist}`);
                    app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    plugin.displayError(error);
                }
            }
        },
    });

    // Delete shelved files command
    plugin.addCommand({
        id: "p4-delete-shelve",
        name: "Delete shelved files",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            const modal = new ShelveModal(app, plugin);
            const changelist = await modal.openAndGetResult();

            if (changelist !== null) {
                try {
                    await plugin.p4Manager.deleteShelve(changelist);
                    plugin.displayMessage(`Deleted shelved files from changelist ${changelist}`);
                    app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    plugin.displayError(error);
                }
            }
        },
    });

    // Refresh
    plugin.addCommand({
        id: "p4-refresh",
        name: "Refresh status",
        callback: () => {
            app.workspace.trigger("obsidian-p4:refresh-now");
        },
    });

    // Show blame for current file
    plugin.addCommand({
        id: "p4-blame",
        name: "Show blame annotations for current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.loadBlame(file.path)
                    .then(() => {
                        plugin.displayMessage(`Loaded blame for: ${file.name}`);
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Refresh blame for current file (clear cache and reload)
    plugin.addCommand({
        id: "p4-refresh-blame",
        name: "Refresh blame for current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.clearBlameCacheForFile(file.path)
                    .then(() => {
                        plugin.displayMessage(`Refreshed blame for: ${file.name}`);
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Clear all blame cache
    plugin.addCommand({
        id: "p4-clear-blame-cache",
        name: "Clear all blame cache",
        callback: () => {
            plugin.clearBlameCache();
            new Notice("Blame cache cleared");
        },
    });

    // Open merge view for current file
    plugin.addCommand({
        id: "p4-open-merge-view",
        name: "Open merge view for current file",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.openMergeView(file.path)
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Resolve conflict: Accept yours
    plugin.addCommand({
        id: "p4-resolve-yours",
        name: "Resolve conflict: Accept yours (keep local)",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.p4Manager.resolve(file.path, "accept-yours")
                    .then(() => {
                        plugin.displayMessage(`Resolved (yours): ${file.name}`);
                        app.workspace.trigger("obsidian-p4:refresh-now");
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Resolve conflict: Accept theirs
    plugin.addCommand({
        id: "p4-resolve-theirs",
        name: "Resolve conflict: Accept theirs (use depot)",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null && plugin.p4Ready;
            }

            if (file) {
                plugin.p4Manager.resolve(file.path, "accept-theirs")
                    .then(() => {
                        plugin.displayMessage(`Resolved (theirs): ${file.name}`);
                        app.workspace.trigger("obsidian-p4:refresh-now");
                    })
                    .catch((error) => plugin.displayError(error));
            }
            return true;
        },
    });

    // Auto-resolve all conflicts safely
    plugin.addCommand({
        id: "p4-resolve-all-safe",
        name: "Auto-resolve all conflicts (safe merge)",
        callback: async () => {
            if (!plugin.p4Ready) {
                new Notice("Perforce is not connected");
                return;
            }

            try {
                plugin.displayMessage("Auto-resolving conflicts...");
                const result = await plugin.p4Manager.resolveAllSafe();
                
                if (result.resolved.length > 0) {
                    plugin.displayMessage(`Auto-resolved ${result.resolved.length} file(s)`);
                }
                if (result.failed.length > 0) {
                    new Notice(`${result.failed.length} file(s) need manual resolution`, 5000);
                }
                if (result.resolved.length === 0 && result.failed.length === 0) {
                    plugin.displayMessage("No conflicts to resolve");
                }
                
                app.workspace.trigger("obsidian-p4:refresh-now");
            } catch (error) {
                plugin.displayError(error);
            }
        },
    });

    // P4 Login command
    plugin.addCommand({
        id: "p4-login",
        name: "Login to Perforce",
        callback: async () => {
            await plugin.promptForLogin();
        },
    });
}

