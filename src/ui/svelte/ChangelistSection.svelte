<script lang="ts">
    import { setIcon } from "obsidian";
    import type { P4FileStatus, P4Changelist } from "../../types";
    import type ObsidianP4 from "../../main";
    import FileComponent from "./FileComponent.svelte";
    import { EditChangelistModal } from "../modals/editChangelistModal";
    import { SubmitModal } from "../modals/submitModal";

    interface Props {
        changelist: number | "default";
        files: P4FileStatus[];
        changelistInfo: P4Changelist | undefined;
        allChangelists: P4Changelist[];
        plugin: ObsidianP4;
        onRefresh: () => void;
    }

    let { changelist, files, changelistInfo, allChangelists, plugin, onRefresh }: Props = $props();

    // Icon refs (declared with $state for bind:this updates)
    let editIcon: HTMLElement | null = $state(null);
    let submitIcon: HTMLElement | null = $state(null);
    let revertIcon: HTMLElement | null = $state(null);
    let deleteIcon: HTMLElement | null = $state(null);

    $effect(() => {
        if (editIcon) setIcon(editIcon, "pencil");
        if (submitIcon) setIcon(submitIcon, "upload");
        if (revertIcon) setIcon(revertIcon, "rotate-ccw");
        if (deleteIcon) setIcon(deleteIcon, "trash");
    });

    function getTitle(): string {
        if (changelist === "default") {
            return "Default changelist";
        }
        return `#${changelist}`;
    }

    function getDescription(): string {
        if (!changelistInfo?.description) return "";
        const desc = changelistInfo.description;
        return desc.length > 30 ? desc.substring(0, 30) + "..." : desc;
    }

    async function editDescription(): Promise<void> {
        if (changelist === "default") return;
        
        const currentDesc = changelistInfo?.description || "";
        const modal = new EditChangelistModal(plugin.app, plugin, changelist, currentDesc);
        const newDescription = await modal.openAndGetResult();
        
        if (newDescription !== null && newDescription !== currentDesc) {
            try {
                await plugin.p4Manager.updateChangelistDescription(changelist, newDescription);
                plugin.displayMessage(`Updated changelist ${changelist}`);
                onRefresh();
            } catch (error) {
                plugin.displayError(error);
            }
        }
    }

    async function submitChangelist(): Promise<void> {
        const modal = new SubmitModal(plugin.app, plugin);
        const description = await modal.openAndGetResult();
        
        if (description) {
            try {
                plugin.displayMessage("Submitting...");
                const changeNum = await plugin.p4Manager.submit(changelist, description);
                plugin.displayMessage(`Submitted changelist ${changeNum}`);
                plugin.app.workspace.trigger("obsidian-p4:refresh-now");
                onRefresh();
            } catch (error) {
                plugin.displayError(error);
            }
        }
    }

    async function revertAll(): Promise<void> {
        try {
            await plugin.p4Manager.revertChangelist(changelist);
            plugin.displayMessage("Reverted all changes");
            plugin.app.workspace.trigger("obsidian-p4:refresh-now");
            onRefresh();
        } catch (error) {
            plugin.displayError(error);
        }
    }

    async function deleteChangelist(): Promise<void> {
        if (changelist === "default") return;
        
        try {
            await plugin.p4Manager.deleteChangelist(changelist);
            plugin.displayMessage(`Deleted changelist ${changelist}`);
            plugin.app.workspace.trigger("obsidian-p4:refresh-now");
            onRefresh();
        } catch (error) {
            plugin.displayError(error);
        }
    }

    let isNumbered = $derived(changelist !== "default");
    let isEmpty = $derived(files.length === 0);
    let description = $derived(getDescription());
</script>

<div class="p4-changelist-section">
    <!-- Header -->
    <div class="p4-changelist-header">
        <!-- Title -->
        <div class="p4-changelist-title-container">
            <span class="p4-changelist-title">{getTitle()}</span>
            <span class="p4-changelist-count">({files.length})</span>
            {#if description}
                <span class="p4-changelist-desc"> - {description}</span>
            {/if}
        </div>

        <!-- Actions -->
        <div class="p4-changelist-actions">
            {#if isNumbered}
                <button 
                    class="clickable-icon p4-changelist-edit-btn"
                    aria-label="Edit description"
                    bind:this={editIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); editDescription(); }}
                ></button>
            {/if}

            {#if !isEmpty}
                <button 
                    class="clickable-icon"
                    aria-label="Submit"
                    bind:this={submitIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); submitChangelist(); }}
                ></button>
                <button 
                    class="clickable-icon"
                    aria-label="Revert all"
                    bind:this={revertIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); revertAll(); }}
                ></button>
            {/if}

            {#if isNumbered && isEmpty}
                <button 
                    class="clickable-icon p4-changelist-delete-btn"
                    aria-label="Delete changelist"
                    bind:this={deleteIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); deleteChangelist(); }}
                ></button>
            {/if}
        </div>
    </div>

    <!-- File list -->
    <div class="p4-file-list">
        {#if isEmpty}
            <div class="p4-file-empty">No files in this changelist</div>
        {:else}
            {#each files as file (file.vaultPath)}
                <FileComponent 
                    {file} 
                    {plugin} 
                    changelists={allChangelists}
                    {onRefresh}
                />
            {/each}
        {/if}
    </div>
</div>

