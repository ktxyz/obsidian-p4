<script lang="ts">
    import { setIcon } from "obsidian";
    import type { P4ConflictFile } from "../../types";
    import type ObsidianP4 from "../../main";

    interface Props {
        conflicts: P4ConflictFile[];
        plugin: ObsidianP4;
        onRefresh: () => void;
    }

    let { conflicts, plugin, onRefresh }: Props = $props();

    let warningIcon: HTMLElement | null = $state(null);
    let conflictIcons: Map<string, HTMLElement> = $state(new Map());

    $effect(() => {
        if (warningIcon) setIcon(warningIcon, "alert-triangle");
        for (const [path, el] of conflictIcons) {
            if (el) setIcon(el, "file-warning");
        }
    });

    async function openMergeView(file: P4ConflictFile): Promise<void> {
        await plugin.openMergeView(file.vaultPath);
    }

    async function acceptYours(file: P4ConflictFile): Promise<void> {
        try {
            await plugin.p4Manager.resolve(file.vaultPath, "accept-yours");
            plugin.displayMessage(`Resolved (yours): ${file.vaultPath.split("/").pop()}`);
            onRefresh();
        } catch (err) {
            plugin.displayError(err);
        }
    }

    async function acceptTheirs(file: P4ConflictFile): Promise<void> {
        try {
            await plugin.p4Manager.resolve(file.vaultPath, "accept-theirs");
            plugin.displayMessage(`Resolved (theirs): ${file.vaultPath.split("/").pop()}`);
            onRefresh();
        } catch (err) {
            plugin.displayError(err);
        }
    }

    async function resolveAllSafe(): Promise<void> {
        try {
            const result = await plugin.p4Manager.resolveAllSafe();
            if (result.resolved.length > 0) {
                plugin.displayMessage(`Auto-resolved ${result.resolved.length} file(s)`);
            }
            if (result.failed.length > 0) {
                plugin.displayMessage(`${result.failed.length} file(s) need manual resolution`);
            }
            onRefresh();
        } catch (err) {
            plugin.displayError(err);
        }
    }

    function setConflictIcon(path: string, el: HTMLElement | null): void {
        if (el) {
            conflictIcons.set(path, el);
            setIcon(el, "file-warning");
        }
    }
</script>

{#if conflicts.length > 0}
    <div class="p4-conflicts-section">
        <div class="p4-conflicts-header">
            <span bind:this={warningIcon} class="p4-conflicts-warning-icon"></span>
            <span class="p4-conflicts-count">{conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} to resolve</span>
            <button class="p4-conflict-resolve-all-btn" onclick={resolveAllSafe}>
                Auto-resolve safe
            </button>
        </div>
        
        <div class="p4-conflicts-list">
            {#each conflicts as file (file.vaultPath)}
                <div class="p4-conflict-file">
                    <span 
                        class="p4-conflict-file-icon"
                        use:setConflictIcon={file.vaultPath}
                    ></span>
                    <button 
                        class="p4-conflict-file-name" 
                        title={file.vaultPath}
                        onclick={() => openMergeView(file)}
                    >
                        {file.vaultPath.split("/").pop()}
                    </button>
                    <div class="p4-conflict-actions">
                        <button 
                            class="p4-conflict-btn p4-conflict-merge-btn" 
                            title="Open merge view"
                            onclick={() => openMergeView(file)}
                        >
                            Merge
                        </button>
                        <button 
                            class="p4-conflict-btn" 
                            title="Accept your version"
                            onclick={() => acceptYours(file)}
                        >
                            Yours
                        </button>
                        <button 
                            class="p4-conflict-btn" 
                            title="Accept their version"
                            onclick={() => acceptTheirs(file)}
                        >
                            Theirs
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .p4-conflicts-section {
        margin-bottom: 1rem;
        border: 1px solid rgba(var(--color-red-rgb), 0.3);
        border-radius: 6px;
        overflow: hidden;
    }

    .p4-conflicts-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        background: rgba(var(--color-red-rgb), 0.1);
    }

    .p4-conflicts-warning-icon {
        display: flex;
        color: var(--color-red);
        width: 16px;
        height: 16px;
    }

    .p4-conflicts-count {
        flex: 1;
        font-size: 0.9rem;
        color: var(--color-red);
        font-weight: 500;
    }

    .p4-conflict-resolve-all-btn {
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        border-radius: 3px;
        cursor: pointer;
        background: var(--background-modifier-hover);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-muted);
    }

    .p4-conflict-resolve-all-btn:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
    }

    .p4-conflicts-list {
        padding: 0.5rem;
    }

    .p4-conflict-file {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.5rem;
        border-radius: 4px;
    }

    .p4-conflict-file:hover {
        background: var(--background-modifier-hover);
    }

    .p4-conflict-file-icon {
        display: flex;
        color: var(--color-red);
        width: 14px;
        height: 14px;
        flex-shrink: 0;
    }

    .p4-conflict-file-name {
        flex: 1;
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        text-align: left;
        color: inherit;
    }

    .p4-conflict-file-name:hover {
        text-decoration: underline;
    }

    .p4-conflict-actions {
        display: flex;
        gap: 0.25rem;
    }

    .p4-conflict-btn {
        padding: 0.15rem 0.4rem;
        font-size: 0.7rem;
        border-radius: 3px;
        cursor: pointer;
        background: var(--background-modifier-hover);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-muted);
    }

    .p4-conflict-btn:hover {
        background: var(--background-modifier-active-hover);
        color: var(--text-normal);
    }

    .p4-conflict-merge-btn {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
    }

    .p4-conflict-merge-btn:hover {
        filter: brightness(1.1);
    }
</style>

