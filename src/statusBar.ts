import type ObsidianP4 from "./main";
import { STATUS_MESSAGES } from "./constants";
import { CurrentP4Action } from "./types";
import { setIcon } from "obsidian";

/**
 * Status bar component for displaying P4 status
 */
export class P4StatusBar {
    private plugin: ObsidianP4;
    private statusBarEl: HTMLElement;
    private pendingCount: number = 0;
    private currentAction: CurrentP4Action = CurrentP4Action.idle;
    private spinnerEl: HTMLElement | null = null;
    private textEl: HTMLElement | null = null;

    constructor(plugin: ObsidianP4, statusBarEl: HTMLElement) {
        this.plugin = plugin;
        this.statusBarEl = statusBarEl;
        this.statusBarEl.addClass("p4-status-bar");
        this.statusBarEl.addEventListener("click", () => this.onClick());
        
        // Create spinner element
        this.spinnerEl = this.statusBarEl.createSpan({ cls: "p4-status-spinner" });
        setIcon(this.spinnerEl, "loader-2");
        this.spinnerEl.style.display = "none";
        
        // Create text element
        this.textEl = this.statusBarEl.createSpan({ cls: "p4-status-text" });
        
        this.display();
    }

    /**
     * Check if currently busy
     */
    private isBusy(): boolean {
        return this.currentAction !== CurrentP4Action.idle;
    }

    /**
     * Update the display
     */
    display(): void {
        let text: string;

        switch (this.currentAction) {
            case CurrentP4Action.syncing:
                text = STATUS_MESSAGES.syncing;
                break;
            case CurrentP4Action.submitting:
                text = STATUS_MESSAGES.submitting;
                break;
            case CurrentP4Action.reverting:
                text = STATUS_MESSAGES.reverting;
                break;
            case CurrentP4Action.checkingOut:
                text = STATUS_MESSAGES.checkingOut;
                break;
            case CurrentP4Action.refreshing:
                text = STATUS_MESSAGES.refreshing;
                break;
            default:
                if (this.pendingCount > 0) {
                    text = `P4: ${this.pendingCount} pending`;
                } else {
                    text = STATUS_MESSAGES.idle;
                }
        }

        // Show/hide spinner based on activity
        if (this.spinnerEl) {
            this.spinnerEl.style.display = this.isBusy() ? "inline-flex" : "none";
        }
        
        // Update text
        if (this.textEl) {
            this.textEl.setText(text);
        }
    }

    /**
     * Set the current action
     */
    setAction(action: CurrentP4Action): void {
        this.currentAction = action;
        this.display();
    }

    /**
     * Set the pending file count
     */
    setPendingCount(count: number): void {
        this.pendingCount = count;
        this.display();
    }

    /**
     * Handle click on status bar
     */
    private onClick(): void {
        // Open source control view on click
        this.plugin.app.workspace.trigger("obsidian-p4:refresh");
    }

    /**
     * Show a temporary message
     */
    displayMessage(message: string, timeout: number = 4000): void {
        if (!this.textEl) return;
        
        const originalText = this.textEl.getText();
        this.textEl.setText(message);

        setTimeout(() => {
            if (this.textEl && this.textEl.getText() === message) {
                this.display();
            }
        }, timeout);
    }

    /**
     * Remove the status bar
     */
    remove(): void {
        this.statusBarEl.remove();
    }
}

