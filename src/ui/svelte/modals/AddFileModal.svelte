<script lang="ts">
    import { setIcon } from "obsidian";

    interface Props {
        fileName: string;
        filePath: string;
        onAdd: () => void;
        onSkip: () => void;
        onSkipSession: () => void;
        onClose: () => void;
    }

    let { fileName, filePath, onAdd, onSkip, onSkipSession, onClose }: Props = $props();

    let addIcon: HTMLElement | null = $state(null);
    let skipIcon: HTMLElement | null = $state(null);

    $effect(() => {
        if (addIcon) setIcon(addIcon, "plus-circle");
        if (skipIcon) setIcon(skipIcon, "x-circle");
    });
</script>

<div class="p4-modal-content">
    <div class="p4-modal-header">
        <h2>Add new file to Perforce?</h2>
    </div>
    
    <div class="p4-modal-body">
        <p>This file is new and not tracked by Perforce:</p>
        <p class="p4-modal-file-path">{filePath}</p>
        <p>Would you like to add it?</p>
    </div>
    
    <div class="p4-modal-actions">
        <button class="mod-cta" onclick={onAdd}>
            <span bind:this={addIcon} class="p4-modal-icon"></span>
            Add to Perforce
        </button>
        
        <button onclick={onSkip}>
            Skip
        </button>
        
        <button onclick={onSkipSession}>
            Don't ask for new files this session
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

