import {
    debounce,
    MarkdownView,
    Notice,
    Plugin,
    TFile,
    TFolder,
    WorkspaceLeaf,
    type Debouncer,
} from "obsidian";
import { P4Manager } from "./p4Manager";
import { P4SettingsTab, DEFAULT_SETTINGS } from "./settings";
import { isTextFile, isEditableFile } from "./constants";
import { P4StatusBar } from "./statusBar";
import { registerCommands } from "./commands";
import {
    SOURCE_CONTROL_VIEW_CONFIG,
    HISTORY_VIEW_CONFIG,
    DIFF_VIEW_CONFIG,
    MERGE_VIEW_CONFIG,
} from "./constants";
import type { P4PluginSettings, P4FileStatus } from "./types";
import { CurrentP4Action } from "./types";
import { P4SourceControlView } from "./ui/sourceControl";
import { P4DiffView } from "./ui/diffView";
import { P4MergeView } from "./ui/mergeView";
import { P4HistoryView } from "./ui/historyView";
import { P4FileDecorators } from "./ui/fileDecorators";
import { CheckoutModal } from "./ui/modals/checkoutModal";
import { AddFileModal } from "./ui/modals/addFileModal";
import { DeleteFileModal } from "./ui/modals/deleteFileModal";
import { PasswordModal } from "./ui/modals/passwordModal";
import { TextInputModal } from "./ui/modals/textInputModal";
import { P4BlameProvider } from "./blame/blameProvider";
import { createBlameExtension, updateBlameInView } from "./blame/blameGutter";
import { EditorView } from "@codemirror/view";

export default class ObsidianP4 extends Plugin {
    settings: P4PluginSettings;
    p4Manager: P4Manager;
    p4Ready: boolean = false;
    blameProvider: P4BlameProvider;
    
    private statusBar: P4StatusBar | null = null;
    private settingsTab: P4SettingsTab | null = null;
    private fileDecorators: P4FileDecorators | null = null;
    private debounceRefresh: Debouncer<[], void>;
    private autoCheckoutDebounce: Map<string, NodeJS.Timeout> = new Map();
    private cachedOpenedFiles: P4FileStatus[] = [];
    /** Files skipped for this session (won't prompt again) */
    private skippedFilesSession: Set<string> = new Set();
    /** Files skipped once (will prompt again on next open) */
    private skippedFilesOnce: Set<string> = new Set();
    /** Skip prompting for new files for this session */
    private skipNewFilesSession: boolean = false;
    /** Skip prompting for deleted files for this session */
    private skipDeleteFilesSession: boolean = false;
    /** Cache of files synced from depot (to detect depot files on delete) */
    private cachedDepotFiles: Set<string> = new Set();
    /** Flag to prevent re-entry when reverting a file modification */
    private isRevertingFile: boolean = false;
    /** Flag to prevent modify handler from interfering with merge resolution */
    public isResolvingMerge: boolean = false;

    async onload(): Promise<void> {
        console.log("Loading Obsidian P4 plugin");

		await this.loadSettings();

        // Initialize P4 manager
        this.p4Manager = new P4Manager(this);

        // Initialize blame provider
        this.blameProvider = new P4BlameProvider(this);

        // Register blame gutter extension
        this.registerEditorExtension(createBlameExtension());

        // Add settings tab
        this.settingsTab = new P4SettingsTab(this.app, this);
        this.addSettingTab(this.settingsTab);

        // Set up refresh debouncer
        this.debounceRefresh = debounce(
            () => this.refresh(),
            this.settings.refreshInterval,
            true
        );

        // Register views
        this.registerView(
            SOURCE_CONTROL_VIEW_CONFIG.type,
            (leaf) => new P4SourceControlView(leaf, this)
        );

        this.registerView(
            HISTORY_VIEW_CONFIG.type,
            (leaf) => new P4HistoryView(leaf, this)
        );

        this.registerView(
            DIFF_VIEW_CONFIG.type,
            (leaf) => new P4DiffView(leaf, this)
        );

        this.registerView(
            MERGE_VIEW_CONFIG.type,
            (leaf) => new P4MergeView(leaf, this)
        );

        // Register events
        this.registerEvents();

        // Register commands
        registerCommands(this);

        // Add ribbon icon
        this.addRibbonIcon(
            SOURCE_CONTROL_VIEW_CONFIG.icon,
            "Open P4 source control",
            async () => {
                await this.openSourceControlView();
            }
        );

        // Initialize on layout ready (use setTimeout to ensure UI is fully loaded first)
        this.app.workspace.onLayoutReady(() => {
            // Defer init to avoid blocking the UI
            setTimeout(() => {
                this.init().catch((e) => this.displayError(e));
            }, 100);
        });
    }

    onunload(): void {
        console.log("Unloading Obsidian P4 plugin");
        this.statusBar?.remove();
        this.fileDecorators?.stop();
        this.autoCheckoutDebounce.forEach((timeout) => clearTimeout(timeout));
        this.autoCheckoutDebounce.clear();
    }

    /**
     * Initialize the plugin
     */
    private async init(): Promise<void> {
        // Check P4 requirements
        const result = await this.p4Manager.checkRequirements();

        switch (result) {
            case "missing-p4":
                this.displayError("p4 command not found. Please install the Perforce CLI.");
                break;
            case "not-in-workspace":
                new Notice("Not in a Perforce workspace. Some features may be unavailable.", 5000);
                break;
            case "not-logged-in":
                // Prompt user to log in
                const loggedIn = await this.promptForLogin("Your Perforce session has expired or you are not logged in.");
                if (loggedIn) {
                    // Successfully logged in, reinitialize was already called
                    return;
                }
                break;
            case "valid":
                // Populate caches BEFORE setting p4Ready to prevent race conditions
                // where file operations happen before caches are populated
                await this.refreshDepotFilesCache();
                this.cachedOpenedFiles = await this.p4Manager.getOpenedFiles().catch(() => []);
                this.p4Ready = true;
                break;
        }

        // Set up status bar
        if (this.settings.showStatusBar) {
            this.enableStatusBar();
        }

        // Set up file decorators
        this.fileDecorators = new P4FileDecorators(this);
        this.fileDecorators.start();

        // Sync on startup if enabled (run in background, don't block)
        if (this.p4Ready && this.settings.syncOnStartup) {
            this.displayMessage("Syncing...");
            this.p4Manager.sync()
                .then(() => {
                    this.displayMessage("Synced on startup");
                    this.refresh().catch(e => console.error("Refresh error:", e));
                })
                .catch((error) => this.displayError(error));
        } else if (this.p4Ready) {
            // Initial refresh (non-blocking)
            this.refresh().catch(e => console.error("Refresh error:", e));
        }
    }

    /**
     * Reinitialize the plugin (called when settings change)
     */
    async reinitialize(): Promise<void> {
        this.p4Ready = false;
        
        // Re-check P4 requirements with new settings
        const result = await this.p4Manager.checkRequirements();

        switch (result) {
            case "missing-p4":
                this.displayError("p4 command not found. Check the executable path.");
                break;
            case "not-in-workspace":
                this.displayError("Not in a Perforce workspace. Check your P4CLIENT setting.");
                break;
            case "not-logged-in":
                // Prompt user to log in
                const loggedInReinit = await this.promptForLogin("Your Perforce session has expired.");
                if (loggedInReinit) {
                    return; // Successfully logged in
                }
                break;
            case "valid":
                this.p4Ready = true;
                this.displayMessage("Connected to Perforce!");
                break;
        }

        if (this.p4Ready) {
            await this.refresh();
        }
    }

    /**
     * Register event handlers
     */
    private registerEvents(): void {
        // Refresh event (debounced for automated/background updates)
        this.registerEvent(
            this.app.workspace.on("obsidian-p4:refresh", () => {
                this.debounceRefresh();
            })
        );
        
        // Immediate refresh event (for user-initiated actions)
        this.registerEvent(
            this.app.workspace.on("obsidian-p4:refresh-now", () => {
                this.refresh();
            })
        );

        // Auto-checkout on editor change (BEFORE save, to handle read-only files)
        this.registerEvent(
            this.app.workspace.on("editor-change", (editor, info) => {
                if (!this.settings.autoCheckout || !this.p4Ready) return;
                
                // Get the file from the view
                const view = info instanceof MarkdownView ? info : null;
                const file = view?.file;
                if (file instanceof TFile) {
                    this.handleAutoCheckout(file);
                }
            })
        );

        // Check file status when opened - warn if not checked out
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (!this.p4Ready || !file) return;
                
                // Check if file is in depot but not checked out
                this.checkFileStatusOnOpen(file);
                
                // Load blame data for the file (if enabled)
                if (this.settings.showInlineBlame) {
                    this.loadBlameForActiveFile(file.path);
                }
            })
        );

        // Intercept mode switch to editing mode on non-checked-out files
        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                if (!this.p4Ready) return;
                this.interceptModeSwitch();
            })
        );

        // Handle file creation - mark for add
        this.registerEvent(
            this.app.vault.on("create", (file) => {
                if (file instanceof TFile && this.settings.autoAddNewFiles && this.p4Ready) {
                    // Debounce to avoid rapid-fire adds
                    this.handleAutoAdd(file);
                }
            })
        );

        // Handle file deletion
        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (file instanceof TFile && this.p4Ready) {
                    this.handleFileDelete(file.path);
                }
            })
        );

        // Block saves on non-checked out depot files
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file instanceof TFile && this.p4Ready) {
                    this.handleFileModify(file);
                }
            })
        );

        // Handle file rename
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file instanceof TFile && this.p4Ready) {
                    this.handleFileRename(file, oldPath);
                }
            })
        );

        // File menu context
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file, source) => {
                if (!this.p4Ready) return;
                
                // Handle folders
                if (file instanceof TFolder) {
                    this.addFolderMenuItems(menu, file);
                    return;
                }
                
                // Handle files
                if (!(file instanceof TFile)) return;

                menu.addItem((item) => {
                    item.setTitle("P4: Add")
                        .setIcon("plus-circle")
                        .onClick(() => {
                            this.p4Manager.add(file.path)
                                .then(() => {
                                    this.displayMessage(`Added to Perforce: ${file.name}`);
                                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                                })
                                .catch((e) => this.displayError(e));
                        });
                });

                menu.addItem((item) => {
                    item.setTitle("P4: Check out")
                        .setIcon("edit")
                        .onClick(() => {
                            this.p4Manager.edit(file.path)
                                .then(() => {
                                    this.displayMessage(`Checked out: ${file.name}`);
                                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                                })
                                .catch((e) => this.displayError(e));
                        });
                });

                menu.addItem((item) => {
                    item.setTitle("P4: Revert")
                        .setIcon("rotate-ccw")
                        .onClick(() => {
                            this.p4Manager.revert(file.path)
                                .then(() => {
                                    this.displayMessage(`Reverted: ${file.name}`);
                                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                                })
                                .catch((e) => this.displayError(e));
                        });
                });

                menu.addItem((item) => {
                    item.setTitle("P4: Show diff")
                        .setIcon("file-diff")
                        .onClick(() => {
                            this.openDiffView(file.path)
                                .catch((e) => this.displayError(e));
                        });
                });

                menu.addItem((item) => {
                    item.setTitle("P4: Rename...")
                        .setIcon("pencil")
                        .onClick(async () => {
                            await this.promptAndRenameFile(file);
                        });
                });
            })
        );
    }

    /**
     * Add P4 context menu items for folders
     */
    private addFolderMenuItems(menu: import("obsidian").Menu, folder: TFolder): void {
        menu.addItem((item) => {
            item.setTitle("P4: Add folder")
                .setIcon("folder-plus")
                .onClick(() => {
                    this.p4Manager.addFolder(folder.path)
                        .then(() => {
                            this.displayMessage(`Added folder to Perforce: ${folder.name}`);
                            this.app.workspace.trigger("obsidian-p4:refresh-now");
                        })
                        .catch((e) => this.displayError(e));
                });
        });

        menu.addItem((item) => {
            item.setTitle("P4: Check out folder")
                .setIcon("folder-edit")
                .onClick(() => {
                    this.p4Manager.editFolder(folder.path)
                        .then(() => {
                            this.displayMessage(`Checked out folder: ${folder.name}`);
                            this.app.workspace.trigger("obsidian-p4:refresh-now");
                        })
                        .catch((e) => this.displayError(e));
                });
        });

        menu.addItem((item) => {
            item.setTitle("P4: Delete folder")
                .setIcon("folder-minus")
                .onClick(() => {
                    this.p4Manager.deleteFolder(folder.path)
                        .then(() => {
                            this.displayMessage(`Marked folder for deletion: ${folder.name}`);
                            this.app.workspace.trigger("obsidian-p4:refresh-now");
                        })
                        .catch((e) => this.displayError(e));
                });
        });

        menu.addItem((item) => {
            item.setTitle("P4: Revert folder")
                .setIcon("folder-x")
                .onClick(() => {
                    this.p4Manager.revertFolder(folder.path)
                        .then(() => {
                            this.displayMessage(`Reverted folder: ${folder.name}`);
                            this.app.workspace.trigger("obsidian-p4:refresh-now");
                        })
                        .catch((e) => this.displayError(e));
                });
        });
    }

    /**
     * Prompt for a new filename and perform P4 move
     */
    private async promptAndRenameFile(file: TFile): Promise<void> {
        // Check if file is in depot
        const isInDepot = await this.p4Manager.isFileInDepot(file.path);
        if (!isInDepot) {
            // Not a depot file - just use Obsidian's native rename
            this.displayMessage("File is not in Perforce. Use Obsidian's rename instead.");
            return;
        }

        // Prompt for new name
        const currentName = file.basename;
        const newName = await this.promptForInput("Rename file", "Enter new filename:", currentName);
        
        if (!newName || newName === currentName) {
            return; // Cancelled or same name
        }

        // Construct new path
        const parentPath = file.parent?.path || "";
        const extension = file.extension;
        const newPath = parentPath ? `${parentPath}/${newName}.${extension}` : `${newName}.${extension}`;

        try {
            // Check out and move in P4
            await this.p4Manager.move(file.path, newPath);
            
            // Now rename the actual file in the vault
            await this.app.fileManager.renameFile(file, newPath);
            
            this.displayMessage(`Renamed: ${file.name} → ${newName}.${extension}`);
            this.app.workspace.trigger("obsidian-p4:refresh-now");
        } catch (error) {
            this.displayError(error);
        }
    }

    /**
     * Simple prompt for text input
     */
    private promptForInput(title: string, placeholder: string, defaultValue: string): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new TextInputModal(this.app, title, placeholder, defaultValue, resolve);
            modal.open();
        });
    }

    /**
     * Handle auto-checkout when a file is edited
     */
    private handleAutoCheckout(file: TFile): void {
        // Only handle editable files (markdown, canvas)
        if (!isEditableFile(file.path)) {
            return;
        }

        // Check if we're already processing this file
        if (this.autoCheckoutDebounce.has(file.path)) {
            return; // Already processing
        }

        // Mark as processing immediately (no debounce - we need to be fast)
        this.autoCheckoutDebounce.set(file.path, setTimeout(() => {
            this.autoCheckoutDebounce.delete(file.path);
        }, 5000)); // Prevent re-processing for 5 seconds
        
        // Run checkout check immediately
        this.doAutoCheckout(file);
    }

    /**
     * Perform the actual auto-checkout
     */
    private async doAutoCheckout(file: TFile): Promise<void> {
        // Skip if in session skip list
        if (this.skippedFilesSession.has(file.path)) {
            return;
        }
        
        // Skip if in once-skip list (but don't remove - that happens on file-open)
        if (this.skippedFilesOnce.has(file.path)) {
            return;
        }
        
        try {
            console.log("P4 auto-checkout: checking", file.path);
            const opened = await this.p4Manager.isFileOpened(file.path);
            console.log("P4 auto-checkout: isOpened =", opened);
            
            if (!opened) {
                // Show modal to ask user if they want to check out
                await this.showCheckoutModal(file);
            }
        } catch (error) {
            // File might not be in depot - that's okay
            console.log("P4 auto-checkout error:", error);
        }
    }

    /**
     * Check file status when opened and prompt for checkout if needed
     */
    private async checkFileStatusOnOpen(file: TFile): Promise<void> {
        // Only show checkout modal for editable files (markdown, canvas)
        if (!isEditableFile(file.path)) {
            return;
        }

        // Skip if file is in session skip list
        if (this.skippedFilesSession.has(file.path)) {
            return;
        }
        
        // Skip if we recently checked this file
        if (this.autoCheckoutDebounce.has(file.path)) {
            return;
        }

        try {
            // First do a fast cached check
            const isInDepotCached = this.isFileInDepotCache(file.path);
            const isOpenedCached = this.isFileOpenedInCache(file.path);
            
            // If file is in depot cache but not opened, force read mode immediately
            if (isInDepotCached && !isOpenedCached) {
                this.forceReadingMode();
            }
            
            // Then do the authoritative P4 check
            const isInDepot = await this.p4Manager.isFileInDepot(file.path);
            if (!isInDepot) {
                // Not a Perforce file - skip
                return;
            }

            const opened = await this.p4Manager.isFileOpened(file.path);
            if (!opened) {
                // File is in depot but not checked out - force reading mode
                console.log("P4: File", file.path, "is not checked out (read-only)");
                this.forceReadingMode();
                
                // Clear the once-skip flag if set (they opened it again)
                this.skippedFilesOnce.delete(file.path);
                
                // Show the checkout modal (user can choose to checkout or skip)
                await this.showCheckoutModal(file);
            }
        } catch {
            // File might not be in depot - that's fine
        }
    }

    /**
     * Force the current active markdown view into reading (preview) mode
     */
    private forceReadingMode(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // Set to preview/reading mode
            const state = view.getState();
            if (state.mode !== "preview") {
                state.mode = "preview";
                view.setState(state, { history: false });
            }
        }
    }

    /**
     * Show the checkout modal for a file
     */
    private async showCheckoutModal(file: TFile): Promise<void> {
        const modal = new CheckoutModal(this.app, this, file);
        const result = await modal.openAndGetResult();

        switch (result) {
            case "checkout":
                try {
                    await this.p4Manager.edit(file.path);
                    this.displayMessage(`Checked out: ${file.name}`);
                    // Switch back to edit mode since file is now checked out
                    this.forceEditingMode();
                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    this.displayError(error);
                }
                break;
            case "checkout-lock":
                try {
                    await this.p4Manager.editAndLock(file.path);
                    this.displayMessage(`Checked out and locked: ${file.name}`);
                    // Switch back to edit mode since file is now checked out
                    this.forceEditingMode();
                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    this.displayError(error);
                }
                break;
            case "skip":
                this.skippedFilesOnce.add(file.path);
                break;
            case "skip-session":
                this.skippedFilesSession.add(file.path);
                break;
            case "cancel":
            default:
                // User cancelled - file remains in reading mode
                break;
        }
    }

    /**
     * Force the current active markdown view into editing (source) mode
     */
    private forceEditingMode(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const state = view.getState();
            if (state.mode !== "source") {
                state.mode = "source";
                view.setState(state, { history: false });
            }
        }
    }

    /** Track if we're currently showing the checkout modal to prevent loops */
    private isShowingModeCheckoutModal: boolean = false;
    /** Track last known mode per file to detect mode switches */
    private lastKnownMode: Map<string, string> = new Map();

    /**
     * Intercept mode switch to editing mode on non-checked-out files
     */
    private async interceptModeSwitch(): Promise<void> {
        // Prevent re-entry while showing modal
        if (this.isShowingModeCheckoutModal) return;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const file = view.file;
        if (!file || !isEditableFile(file.path)) return;

        const state = view.getState();
        const currentMode = state.mode as string;
        const lastMode = this.lastKnownMode.get(file.path);

        // Update last known mode
        this.lastKnownMode.set(file.path, currentMode);

        // Only intercept if switching TO source/edit mode (not from it)
        if (currentMode !== "source" || lastMode === "source") {
            return;
        }

        // Check if file is in depot but not checked out (fast cached check)
        const isInDepot = this.isFileInDepotCache(file.path);
        const isOpened = this.isFileOpenedInCache(file.path);

        if (isInDepot && !isOpened) {
            // File is in depot but not checked out - show checkout modal
            this.isShowingModeCheckoutModal = true;
            
            try {
                // First, immediately switch back to reading mode
                this.forceReadingMode();
                this.lastKnownMode.set(file.path, "preview");
                
                // Then show the checkout modal
                await this.showCheckoutModal(file);
                
                // After modal closes, check if file is now checked out
                const nowOpened = this.isFileOpenedInCache(file.path) || 
                                  await this.p4Manager.isFileOpened(file.path).catch(() => false);
                
                if (nowOpened) {
                    // File was checked out - switch to edit mode
                    this.forceEditingMode();
                    this.lastKnownMode.set(file.path, "source");
                }
                // If not checked out, stay in reading mode (already set above)
            } finally {
                this.isShowingModeCheckoutModal = false;
            }
        }
    }

    /**
     * Load blame data for the active file and update the editor
     */
    private async loadBlameForActiveFile(filePath: string): Promise<void> {
        await this.loadBlame(filePath);
    }

    /**
     * Load blame data for a file and update the editor
     */
    async loadBlame(filePath: string): Promise<void> {
        if (!this.p4Ready) {
            console.log("P4 Blame: Not ready");
            return;
        }

        if (!this.settings.showInlineBlame) {
            console.log("P4 Blame: Disabled in settings");
            return;
        }

        // Skip blame for non-text files (binary files can't be annotated)
        if (!isTextFile(filePath)) {
            console.log("P4 Blame: Skipping non-text file", filePath);
            return;
        }

        try {
            console.log("P4 Blame: Loading blame for", filePath);
            const blameData = await this.blameProvider.getBlame(filePath);
            
            if (!blameData) {
                console.log("P4 Blame: No blame data returned");
                return;
            }
            
            console.log("P4 Blame: Got", blameData.lines.length, "lines");

            // Find the active editor and update its blame data
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView || activeView.file?.path !== filePath) {
                console.log("P4 Blame: Active view doesn't match file");
                return;
            }

            // Access the CodeMirror EditorView
            // @ts-expect-error - accessing internal structure
            const editorView = activeView.editor?.cm as EditorView | undefined;
            
            if (!editorView) {
                console.log("P4 Blame: Could not get CodeMirror EditorView");
                return;
            }
            
            console.log("P4 Blame: Updating view with blame data");
            updateBlameInView(editorView, blameData);
        } catch (error) {
            console.error("P4 Blame: Failed to load blame for", filePath, error);
            throw error;
        }
    }

    /**
     * Clear all blame cache
     */
    clearBlameCache(): void {
        this.blameProvider.invalidateAll();
        console.log("P4 Blame: Cache cleared");
    }

    /**
     * Clear blame cache for a specific file and refresh
     */
    async clearBlameCacheForFile(filePath: string): Promise<void> {
        this.blameProvider.invalidate(filePath);
        console.log("P4 Blame: Cache cleared for", filePath);
        
        // Reload blame for this file
        await this.loadBlame(filePath);
    }

    /**
     * Handle auto-add when a file is created
     */
    private handleAutoAdd(file: TFile): void {
        // Skip if user opted out for this session
        if (this.skipNewFilesSession) {
            return;
        }

        const existing = this.autoCheckoutDebounce.get(file.path);
        if (existing) {
            clearTimeout(existing);
        }

        const timeout = setTimeout(async () => {
            this.autoCheckoutDebounce.delete(file.path);
            await this.showAddFileModal(file);
        }, 500);

        this.autoCheckoutDebounce.set(file.path, timeout);
    }

    /**
     * Show modal to add a new file to Perforce
     */
    private async showAddFileModal(file: TFile): Promise<void> {
        const modal = new AddFileModal(this.app, this, file);
        const result = await modal.openAndGetResult();

        switch (result) {
            case "add":
                try {
                    await this.p4Manager.add(file.path);
                    this.displayMessage(`Added to Perforce: ${file.name}`);
                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    this.displayError(error);
                }
                break;
            case "skip":
                // Don't add this file
                break;
            case "skip-session":
                this.skipNewFilesSession = true;
                this.displayMessage("Won't prompt to add new files for this session");
                break;
            case "cancel":
                // User closed modal
                break;
        }
    }

    /**
     * Handle file modification - block saves on non-checked out depot files
     */
    private async handleFileModify(file: TFile): Promise<void> {
        // Skip if we're currently in the process of reverting or resolving a merge
        if (this.isRevertingFile || this.isResolvingMerge) return;
        
        // Check if file is in depot (quick cached check)
        if (!this.isFileInDepotCache(file.path)) {
            return; // Not a depot file, allow modification
        }
        
        // Check if file is checked out using CACHED data first (instant check)
        // This is critical for blocking saves on file close which happen quickly
        if (this.isFileOpenedInCache(file.path)) {
            return; // File is checked out, allow modification
        }
        
        // Double-check with P4 in case cache is stale (but don't wait for this to block)
        // The cache check above should catch most cases
        
        // File is in depot but NOT checked out - block the save
        this.isRevertingFile = true;
        
        try {
            // Get the original content from depot and restore it
            const depotContent = await this.p4Manager.getDepotContent(file.path);
            if (depotContent !== null) {
                await this.app.vault.adapter.write(file.path, depotContent);
                new Notice(`Save blocked: ${file.name} is not checked out. Check out the file first to edit it.`, 5000);
            }
        } catch (error) {
            console.error("Failed to restore depot content:", error);
            new Notice(`Cannot save ${file.name} - file is not checked out`, 5000);
        } finally {
            this.isRevertingFile = false;
        }
    }

    /**
     * Check if a file is opened (checked out) using cached data
     * This is a fast synchronous check for blocking saves
     */
    private isFileOpenedInCache(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, "/").toLowerCase();
        for (const opened of this.cachedOpenedFiles) {
            const openedPath = opened.vaultPath.replace(/\\/g, "/").toLowerCase();
            if (openedPath === normalized) {
                return true;
            }
            // Also check by filename for partial matches
            if (normalized.endsWith("/" + openedPath) || openedPath.endsWith("/" + normalized)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Handle file deletion - prompt to p4 delete if file was in depot
     */
    private async handleFileDelete(filePath: string): Promise<void> {
        // Skip if user opted out for this session
        if (this.skipDeleteFilesSession) {
            this.debounceRefresh();
            return;
        }

        // Check if the file was in the depot (using cached data since file is already gone)
        if (!this.isFileInDepotCache(filePath)) {
            // Not a depot file, just refresh
            this.debounceRefresh();
            return;
        }

        // File was in depot - show the delete modal
        await this.showDeleteFileModal(filePath);
    }

    /**
     * Show modal to ask user if they want to p4 delete the file
     */
    private async showDeleteFileModal(filePath: string): Promise<void> {
        const modal = new DeleteFileModal(this.app, this, filePath);
        const result = await modal.openAndGetResult();

        switch (result) {
            case "delete":
                try {
                    await this.p4Manager.delete(filePath);
                    this.displayMessage(`Marked for deletion: ${filePath.split("/").pop()}`);
                    this.app.workspace.trigger("obsidian-p4:refresh-now");
                } catch (error) {
                    this.displayError(error);
                }
                break;
            case "keep":
                // Just refresh - file stays in depot but is missing locally
                this.displayMessage("File kept in Perforce (will show as missing)");
                this.debounceRefresh();
                break;
            case "skip-session":
                this.skipDeleteFilesSession = true;
                this.displayMessage("Won't prompt for file deletions this session");
                this.debounceRefresh();
                break;
            case "cancel":
            default:
                this.debounceRefresh();
                break;
        }
    }

    /**
     * Handle file rename - check if it's a depot file and handle accordingly
     */
    private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
        try {
            // Check if the OLD file was in the depot
            const wasInDepot = await this.p4Manager.isFileInDepot(oldPath);
            
            if (!wasInDepot) {
                // Not a depot file, just refresh
                this.debounceRefresh();
                return;
            }

            // Check if the file was already checked out before the rename
            // Since it's already renamed, we check if the NEW path is opened
            // (P4 might have auto-tracked the rename if it was checked out)
            const wasOpened = await this.p4Manager.isFileOpened(file.path).catch(() => false);
            
            if (wasOpened) {
                // File was checked out - do p4 move
                try {
                    await this.p4Manager.move(oldPath, file.path);
                    this.displayMessage(`Moved in Perforce: ${file.name}`);
                    this.debounceRefresh();
                } catch (error) {
                    this.displayError(error);
                }
            } else {
                // File was NOT checked out - revert the rename
                this.displayError(`Cannot rename: ${oldPath.split("/").pop()} is not checked out. Reverting rename...`);
                
                try {
                    // Move the file back to its original location
                    await this.p4Manager.revertRename(file.path, oldPath);
                    
                    // Force Obsidian to refresh its file cache
                    // We need to trigger a reload of the file list
                    setTimeout(() => {
                        this.app.vault.trigger("rename", this.app.vault.getAbstractFileByPath(oldPath), file.path);
                        this.app.workspace.trigger("obsidian-p4:refresh-now");
                    }, 100);
                    
                    this.displayMessage(`Rename reverted. Check out the file first to rename it.`);
                } catch (revertError) {
                    this.displayError(`Failed to revert rename: ${revertError}`);
                }
            }
        } catch (error) {
            // If any check fails, just refresh
            console.error("P4: Error handling rename:", error);
            this.debounceRefresh();
        }
    }

    /**
     * Refresh the plugin state
     */
    async refresh(): Promise<void> {
        if (!this.p4Ready) return;

        try {
            this.statusBar?.setAction(CurrentP4Action.refreshing);
            
            this.cachedOpenedFiles = await this.p4Manager.getOpenedFiles();
            this.statusBar?.setPendingCount(this.cachedOpenedFiles.length);
            
            // Also refresh the depot files cache
            await this.refreshDepotFilesCache();
            
            this.app.workspace.trigger("obsidian-p4:status-changed", this.cachedOpenedFiles);
        } catch (error) {
            console.error("P4 refresh error:", error);
        } finally {
            this.statusBar?.setAction(CurrentP4Action.idle);
        }
    }

    /**
     * Refresh the cached depot files (files synced from depot)
     */
    private async refreshDepotFilesCache(): Promise<void> {
        try {
            this.cachedDepotFiles = await this.p4Manager.getHaveFiles();
        } catch (error) {
            console.error("P4 depot files cache error:", error);
        }
    }

    /**
     * Check if a file path is in the depot cache
     */
    isFileInDepotCache(filePath: string): boolean {
        if (this.cachedDepotFiles.has(filePath)) return true;
        // Try with normalized slashes
        const normalized = filePath.replace(/\\/g, "/");
        if (this.cachedDepotFiles.has(normalized)) return true;
        // Case-insensitive check
        const lower = normalized.toLowerCase();
        for (const cachedPath of this.cachedDepotFiles) {
            if (cachedPath.toLowerCase() === lower) return true;
        }
        return false;
    }

    /**
     * Get cached opened files
     */
    getCachedOpenedFiles(): P4FileStatus[] {
        return this.cachedOpenedFiles;
    }

    /**
     * Open the source control view
     */
    async openSourceControlView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(SOURCE_CONTROL_VIEW_CONFIG.type);
        let leaf = leaves.length > 0 ? leaves[0] : null;
        
        if (!leaf) {
            const rightLeaf = this.app.workspace.getRightLeaf(false);
            leaf = rightLeaf ?? this.app.workspace.getLeaf(true);
            await leaf.setViewState({
                type: SOURCE_CONTROL_VIEW_CONFIG.type,
            });
        }
        
        await this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Open the diff view for a file
     */
    async openDiffView(filePath: string): Promise<void> {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({
            type: DIFF_VIEW_CONFIG.type,
            state: { filePath },
        });
        await this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Open the merge view for a conflicted file
     */
    async openMergeView(filePath: string): Promise<void> {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({
            type: MERGE_VIEW_CONFIG.type,
            state: { filePath },
        });
        await this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Open the history view
     */
    async openHistoryView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(HISTORY_VIEW_CONFIG.type);
        let leaf = leaves.length > 0 ? leaves[0] : null;
        
        if (!leaf) {
            const rightLeaf = this.app.workspace.getRightLeaf(false);
            leaf = rightLeaf ?? this.app.workspace.getLeaf(true);
            await leaf.setViewState({
                type: HISTORY_VIEW_CONFIG.type,
            });
        }
        
        await this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Prompt for P4 password and attempt to login
     */
    async promptForLogin(message?: string): Promise<boolean> {
        const modal = new PasswordModal(this.app, message);
        const password = await modal.openAndGetResult();
        
        if (!password) {
            return false; // User cancelled
        }
        
        try {
            await this.p4Manager.login(password);
            this.displayMessage("Successfully logged in to Perforce");
            
            // Reinitialize after login
            await this.reinitialize();
            return true;
        } catch (error) {
            this.displayError(error);
            return false;
        }
    }

    /**
     * Enable the status bar
     */
    enableStatusBar(): void {
        if (!this.statusBar) {
            const statusBarEl = this.addStatusBarItem();
            this.statusBar = new P4StatusBar(this, statusBarEl);
        }
    }

    /**
     * Disable the status bar
     */
    disableStatusBar(): void {
        this.statusBar?.remove();
        this.statusBar = null;
    }

    /**
     * Display a message to the user
     */
    displayMessage(message: string): void {
        if (this.settings.showNotices) {
            new Notice(message);
        }
        this.statusBar?.displayMessage(message);
        console.log(`P4: ${message}`);
    }

    /**
     * Display an error to the user
     */
    displayError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`P4 Error: ${message}`, 10000);
        console.error("P4 Error:", error);
    }

    /**
     * Load settings from storage
     */
    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Save settings to storage
     */
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
	}
}
