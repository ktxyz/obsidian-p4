<script lang="ts">
    import { setIcon } from "obsidian";
    import type { P4FileStatus, P4Changelist, P4ConflictFile } from "../../types";
    import type ObsidianP4 from "../../main";
    import ChangelistSection from "./ChangelistSection.svelte";
    import ConflictSection from "./ConflictSection.svelte";
    import { EditChangelistModal } from "../modals/editChangelistModal";

    interface Props {
        plugin: ObsidianP4;
        openedFiles: P4FileStatus[];
        changelists: P4Changelist[];
        conflicts: P4ConflictFile[];
        isConnected: boolean;
        error: string | null;
        onRefresh: () => void;
        onSync: () => void;
        onSubmit: () => void;
    }

    let { 
        plugin, 
        openedFiles, 
        changelists,
        conflicts, 
        isConnected, 
        error, 
        onRefresh,
        onSync,
        onSubmit
    }: Props = $props();

    // Icon refs
    let refreshIcon: HTMLElement;
    let syncIcon: HTMLElement;
    let submitIcon: HTMLElement;
    let newClIcon: HTMLElement;
    let historyIcon: HTMLElement;

    $effect(() => {
        if (refreshIcon) setIcon(refreshIcon, "refresh-cw");
        if (syncIcon) setIcon(syncIcon, "download");
        if (submitIcon) setIcon(submitIcon, "upload");
        if (newClIcon) setIcon(newClIcon, "plus");
        if (historyIcon) setIcon(historyIcon, "history");
    });

    async function openHistory(): Promise<void> {
        await plugin.openHistoryView();
    }

    async function createNewChangelist(): Promise<void> {
        const modal = new EditChangelistModal(plugin.app, plugin, 0, "");
        const description = await modal.openAndGetResult();
        
        if (description) {
            try {
                const changeNum = await plugin.p4Manager.createChangelist(description);
                plugin.displayMessage(`Created changelist ${changeNum}`);
                onRefresh();
            } catch (err) {
                plugin.displayError(err);
            }
        }
    }

    // Group files by changelist
    function getFilesByChangelist(): Map<number | "default", P4FileStatus[]> {
        const map = new Map<number | "default", P4FileStatus[]>();
        
        for (const file of openedFiles) {
            const cl = file.changelist;
            if (!map.has(cl)) {
                map.set(cl, []);
            }
            map.get(cl)!.push(file);
        }
        
        return map;
    }

    // Get all changelists to render (including empty ones)
    function getChangelistsToRender(): (number | "default")[] {
        const result: (number | "default")[] = ["default"];
        
        // Add numbered changelists from pendingChangelists
        for (const cl of changelists) {
            if (cl.change !== "default" && !result.includes(cl.change)) {
                result.push(cl.change);
            }
        }
        
        // Add any changelists that have files but weren't in the list
        const filesByChangelist = getFilesByChangelist();
        for (const cl of filesByChangelist.keys()) {
            if (!result.includes(cl)) {
                result.push(cl);
            }
        }
        
        return result;
    }

    let filesByChangelist = $derived(getFilesByChangelist());
    let changelistsToRender = $derived(getChangelistsToRender());
</script>

<div class="p4-source-control-view">
    <!-- Header -->
    <div class="p4-view-header">
        <div class="p4-view-title">
            <span>Perforce</span>
        </div>
        
        <div class="p4-view-actions">
            <button 
                class="p4-action-button"
                aria-label="Refresh"
                bind:this={refreshIcon}
                onclick={onRefresh}
            ></button>
            <button 
                class="p4-action-button"
                aria-label="Sync"
                bind:this={syncIcon}
                onclick={onSync}
            ></button>
            <button 
                class="p4-action-button"
                aria-label="Submit"
                bind:this={submitIcon}
                onclick={onSubmit}
            ></button>
            <button 
                class="p4-action-button"
                aria-label="New changelist"
                bind:this={newClIcon}
                onclick={createNewChangelist}
            ></button>
            <button 
                class="p4-action-button"
                aria-label="History"
                bind:this={historyIcon}
                onclick={openHistory}
            ></button>
        </div>
    </div>

    <!-- Content -->
    <div class="p4-view-content">
        {#if !isConnected}
            <div class="p4-empty-state">
                <p>Perforce is not connected</p>
                <p class="p4-muted">Check that p4 is installed and you're in a valid workspace.</p>
            </div>
        {:else if error}
            <div class="p4-error-state">
                <p>Error loading changes</p>
                <p class="p4-muted">{error}</p>
            </div>
        {:else}
            <!-- Conflicts section (if any) -->
            <ConflictSection 
                {conflicts}
                {plugin}
                {onRefresh}
            />
            
            {#each changelistsToRender as cl (cl)}
                <ChangelistSection
                    changelist={cl}
                    files={filesByChangelist.get(cl) || []}
                    changelistInfo={changelists.find(c => c.change === cl)}
                    allChangelists={changelists}
                    {plugin}
                    {onRefresh}
                />
            {/each}
        {/if}
    </div>
</div>

