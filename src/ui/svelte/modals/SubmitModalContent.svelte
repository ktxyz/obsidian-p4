<script lang="ts">
    interface Props {
        defaultMessage: string;
        onSubmit: (description: string) => void;
        onCancel: () => void;
    }

    let { defaultMessage, onSubmit, onCancel }: Props = $props();

    // Initialize with prop value - intentionally captures initial value
    // (user will edit this textarea, we don't want it to reset)
    let description: string = $state("");
    
    // Set initial value from prop on first render
    $effect.pre(() => {
        if (description === "" && defaultMessage) {
            description = defaultMessage;
        }
    });
</script>

<div class="p4-submit-modal-content">
    <h2>Submit changelist</h2>
    
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">Description</div>
            <div class="setting-item-description">Enter a description for this changelist</div>
        </div>
        <div class="setting-item-control">
            <textarea 
                class="p4-submit-description"
                bind:value={description}
                rows="4"
                placeholder="Enter changelist description..."
            ></textarea>
        </div>
    </div>
    
    <div class="p4-modal-buttons">
        <button class="mod-cta" onclick={() => onSubmit(description)}>
            Submit
        </button>
        <button onclick={onCancel}>
            Cancel
        </button>
    </div>
</div>

<style>
    .p4-submit-modal-content {
        padding: 16px;
    }

    .p4-submit-modal-content h2 {
        margin-top: 0;
        margin-bottom: 16px;
    }

    .p4-submit-description {
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

