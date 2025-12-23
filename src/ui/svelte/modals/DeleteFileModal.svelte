<script lang="ts">
    import { setIcon } from "obsidian";

    interface Props {
        fileName: string;
        filePath: string;
        onDelete: () => void;
        onKeep: () => void;
        onSkipSession: () => void;
        onClose: () => void;
    }

    let { fileName, filePath, onDelete, onKeep, onSkipSession, onClose }: Props = $props();

    let deleteIcon: HTMLElement | null = $state(null);
    let keepIcon: HTMLElement | null = $state(null);

    $effect(() => {
        if (deleteIcon) setIcon(deleteIcon, "trash-2");
        if (keepIcon) setIcon(keepIcon, "file-x");
    });
</script>

<div class="p4-modal-content">
    <div class="p4-modal-header">
        <h2>Delete file from Perforce?</h2>
    </div>
    
    <div class="p4-modal-body">
        <p>This file was deleted locally and is tracked by Perforce:</p>
        <p class="p4-modal-file-path">{filePath}</p>
        <p>Would you like to mark it for deletion in Perforce as well?</p>
    </div>
    
    <div class="p4-modal-actions">
        <button class="mod-warning" onclick={onDelete}>
            <span bind:this={deleteIcon} class="p4-modal-icon"></span>
            Mark for P4 delete
        </button>
        
        <button onclick={onKeep}>
            <span bind:this={keepIcon} class="p4-modal-icon"></span>
            Keep in Perforce (local delete only)
        </button>
        
        <button onclick={onSkipSession}>
            Don't ask for deletions this session
        </button>
        
        <button onclick={onClose}>
            Cancel
        </button>
    </div>
</div>

<style>
    .p4-modal-content {
        padding: 1rem;
    }
    
    .p4-modal-header h2 {
        margin: 0 0 1rem 0;
        font-size: 1.2em;
    }
    
    .p4-modal-body {
        margin-bottom: 1.5rem;
    }
    
    .p4-modal-body p {
        margin: 0.5rem 0;
    }
    
    .p4-modal-file-path {
        font-family: var(--font-monospace);
        font-size: 0.9em;
        padding: 0.5rem;
        background: var(--background-secondary);
        border-radius: 4px;
        word-break: break-all;
    }
    
    .p4-modal-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .p4-modal-actions button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
    }
    
    .p4-modal-icon {
        width: 16px;
        height: 16px;
    }
</style>

