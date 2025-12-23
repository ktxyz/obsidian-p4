<script lang="ts">
    import { setIcon } from "obsidian";

    interface Props {
        fileName: string;
        filePath: string;
        onCheckout: () => void;
        onCheckoutLock: () => void;
        onSkip: () => void;
        onSkipSession: () => void;
        onClose: () => void;
    }

    let { fileName, filePath, onCheckout, onCheckoutLock, onSkip, onSkipSession, onClose }: Props = $props();

    let lockIcon: HTMLElement;
    let editIcon: HTMLElement;

    $effect(() => {
        if (lockIcon) setIcon(lockIcon, "lock");
        if (editIcon) setIcon(editIcon, "edit");
    });
</script>

<div class="p4-checkout-modal-content">
    <div class="p4-checkout-header">
        <div class="p4-checkout-icon" bind:this={editIcon}></div>
        <h2>File not checked out</h2>
    </div>
    
    <p class="p4-checkout-message">
        <strong>{fileName}</strong> is read-only because it's not checked out in Perforce.
    </p>
    
    <p class="p4-checkout-path">{filePath}</p>
    
    <div class="p4-checkout-actions">
        <button class="mod-cta" onclick={onCheckout}>
            Check out
        </button>
        
        <button onclick={onCheckoutLock}>
            <span class="p4-btn-icon" bind:this={lockIcon}></span>
            Check out & Lock
        </button>
    </div>
    
    <div class="p4-checkout-skip-actions">
        <button class="p4-skip-btn" onclick={onSkip}>
            Skip this file
        </button>
        
        <button class="p4-skip-btn" onclick={onSkipSession}>
            Don't ask again this session
        </button>
    </div>
</div>

<style>
    .p4-checkout-modal-content {
        padding: 16px;
    }

    .p4-checkout-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
    }

    .p4-checkout-header h2 {
        margin: 0;
        font-size: 18px;
    }

    .p4-checkout-icon {
        color: var(--text-warning);
    }

    .p4-checkout-message {
        margin-bottom: 8px;
    }

    .p4-checkout-path {
        font-size: 12px;
        color: var(--text-faint);
        font-family: var(--font-monospace);
        margin-bottom: 20px;
        word-break: break-all;
    }

    .p4-checkout-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
    }

    .p4-checkout-actions button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    }

    .p4-btn-icon {
        display: flex;
        width: 16px;
        height: 16px;
    }

    .p4-checkout-skip-actions {
        display: flex;
        gap: 8px;
        padding-top: 12px;
        border-top: 1px solid var(--background-modifier-border);
    }

    .p4-skip-btn {
        flex: 1;
        background: transparent;
        border: 1px solid var(--background-modifier-border);
        color: var(--text-muted);
        font-size: 12px;
    }

    .p4-skip-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }
</style>

