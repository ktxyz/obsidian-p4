<script lang="ts">
    interface Props {
        changelist: number | 0; // 0 = new changelist
        initialDescription: string;
        onSave: (description: string) => void;
        onCancel: () => void;
    }

    let { changelist, initialDescription, onSave, onCancel }: Props = $props();

    // Initialize with prop value - intentionally captures initial value
    let description: string = $state("");
    let initialized: boolean = $state(false);
    
    // Set initial value from prop on first render
    $effect.pre(() => {
        if (!initialized && initialDescription !== undefined) {
            description = initialDescription || "";
            initialized = true;
        }
    });
    
    let isNew = $derived(changelist === 0);
    let title = $derived(isNew ? "Create new changelist" : `Edit changelist ${changelist}`);
    let buttonText = $derived(isNew ? "Create" : "Save");
</script>

<div class="p4-edit-changelist-content">
    <h2>{title}</h2>
    
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">Description</div>
            <div class="setting-item-description">
                {#if isNew}
                    Enter a description for the new changelist
                {:else}
                    Enter a new description for this changelist
                {/if}
            </div>
        </div>
        <div class="setting-item-control">
            <textarea 
                class="p4-changelist-description"
                bind:value={description}
                rows="4"
                placeholder="Changelist description..."
            ></textarea>
        </div>
    </div>
    
    <div class="p4-modal-buttons">
        <button class="mod-cta" onclick={() => onSave(description)}>
            {buttonText}
        </button>
        <button onclick={onCancel}>
            Cancel
        </button>
    </div>
</div>

<style>
    .p4-edit-changelist-content {
        padding: 16px;
    }

    .p4-edit-changelist-content h2 {
        margin-top: 0;
        margin-bottom: 16px;
    }

    .p4-changelist-description {
        width: 100%;
        min-width: 300px;
        font-family: var(--font-monospace);
        resize: vertical;
    }

    .p4-modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
    }
</style>

