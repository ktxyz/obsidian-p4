<script lang="ts">
    import { setIcon, Menu } from "obsidian";
    import type { P4FileStatus, P4Changelist, P4Action } from "../../types";
    import type ObsidianP4 from "../../main";

    interface Props {
        file: P4FileStatus;
        plugin: ObsidianP4;
        changelists: P4Changelist[];
        onRefresh: () => void;
    }

    let { file, plugin, changelists, onRefresh }: Props = $props();

    // Icon refs (declared with $state for bind:this updates)
    let openIcon: HTMLElement | null = $state(null);
    let revertIcon: HTMLElement | null = $state(null);
    let diffIcon: HTMLElement | null = $state(null);
    let statusIcon: HTMLElement | null = $state(null);
    
    // Keyboard handler for accessibility
    function handleKeydown(e: KeyboardEvent, callback: () => void) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            callback();
        }
    }

    function getStatusIcon(action: P4Action): string {
        // Check if file has exclusive lock (+l type modifier)
        if (file.type?.includes("+l")) {
            return "user-lock";
        }
        
        // Match icons from file tree decorators (fileDecorators.ts)
        switch (action) {
            case "add": return "file-plus";
            case "edit": return "file-pen-line";
            case "delete": return "file-x";
            case "move/add": return "copy-plus";
            case "move/delete": return "copy-minus";
            case "branch": return "git-branch";
            case "integrate": return "git-merge";
            default: return "circle";
        }
    }

    function getStatusClass(action: P4Action): string {
        // Check if file has exclusive lock (+l type modifier)
        if (file.type?.includes("+l")) {
            return "p4-status-locked";
        }
        
        switch (action) {
            case "add": return "p4-status-add";
            case "edit": return "p4-status-edit";
            case "delete": return "p4-status-delete";
            case "move/add":
            case "move/delete": return "p4-status-move";
            case "branch": return "p4-status-branch";
            case "integrate": return "p4-status-integrate";
            default: return "";
        }
    }

    $effect(() => {
        if (openIcon) setIcon(openIcon, "go-to-file");
        if (revertIcon) setIcon(revertIcon, "undo");
        if (diffIcon) setIcon(diffIcon, "file-diff");
        if (statusIcon) setIcon(statusIcon, getStatusIcon(file.action));
    });

    let statusClass = $derived(getStatusClass(file.action));

    function getFileName(): string {
        return file.vaultPath.split("/").pop() || file.vaultPath;
    }

    async function openFile(): Promise<void> {
        const tFile = plugin.app.vault.getAbstractFileByPath(file.vaultPath);
        if (tFile) {
            await plugin.app.workspace.getLeaf().openFile(tFile as any);
        }
    }

    async function revertFile(): Promise<void> {
        try {
            await plugin.p4Manager.revert(file.vaultPath);
            plugin.displayMessage(`Reverted: ${file.vaultPath}`);
            plugin.app.workspace.trigger("obsidian-p4:refresh-now");
            onRefresh();
        } catch (error) {
            plugin.displayError(error);
        }
    }

    async function showDiff(): Promise<void> {
        try {
            await plugin.openDiffView(file.vaultPath);
        } catch (error) {
            plugin.displayError(error);
        }
    }

    function showContextMenu(event: MouseEvent): void {
        event.preventDefault();
        
        const menu = new Menu();
        
        menu.addItem((item) => {
            item.setTitle("Open file")
                .setIcon("file")
                .onClick(() => openFile());
        });
        
        menu.addItem((item) => {
            item.setTitle("Show diff")
                .setIcon("file-diff")
                .onClick(() => showDiff());
        });
        
        menu.addSeparator();
        
        // Move to changelist submenu
        menu.addItem((item) => {
            item.setTitle("Move to changelist")
                .setIcon("folder-input");
            
            const submenu = (item as any).setSubmenu();
            
            // Default changelist
            if (file.changelist !== "default") {
                submenu.addItem((subItem: any) => {
                    subItem.setTitle("Default changelist")
                        .onClick(async () => {
                            try {
                                await plugin.p4Manager.moveToChangelist(file.vaultPath, "default");
                                plugin.displayMessage(`Moved to default changelist`);
                                plugin.app.workspace.trigger("obsidian-p4:refresh-now");
                                onRefresh();
                            } catch (error) {
                                plugin.displayError(error);
                            }
                        });
                });
            }
            
            // Numbered changelists
            for (const cl of changelists) {
                if (cl.change === "default" || cl.change === file.changelist) continue;
                
                submenu.addItem((subItem: any) => {
                    const title = `#${cl.change}${cl.description ? ` - ${cl.description}` : ""}`;
                    subItem.setTitle(title)
                        .onClick(async () => {
                            try {
                                await plugin.p4Manager.moveToChangelist(file.vaultPath, cl.change as number);
                                plugin.displayMessage(`Moved to changelist ${cl.change}`);
                                plugin.app.workspace.trigger("obsidian-p4:refresh-now");
                                onRefresh();
                            } catch (error) {
                                plugin.displayError(error);
                            }
                        });
                });
            }
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Revert")
                .setIcon("rotate-ccw")
                .onClick(() => revertFile());
        });
        
        menu.showAtMouseEvent(event);
    }

</script>

<div class="tree-item nav-file">
    <div 
        class="tree-item-self is-clickable nav-file-title"
        data-path={file.vaultPath}
        onclick={showDiff}
        onkeydown={(e: KeyboardEvent) => handleKeydown(e, showDiff)}
        oncontextmenu={showContextMenu}
        role="button"
        tabindex="0"
    >
        <!-- File name -->
        <div class="tree-item-inner nav-file-title-content">
            {getFileName()}
        </div>

        <!-- Tools: buttons + type indicator -->
        <div class="p4-tools">
            <!-- Action buttons (visible on hover) -->
            <div class="buttons">
                <button 
                    class="clickable-icon" 
                    aria-label="Open file"
                    bind:this={openIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); openFile(); }}
                ></button>
                <button 
                    class="clickable-icon" 
                    aria-label="Revert"
                    bind:this={revertIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); revertFile(); }}
                ></button>
                <button 
                    class="clickable-icon" 
                    aria-label="Show diff"
                    bind:this={diffIcon}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); showDiff(); }}
                ></button>
            </div>

            <!-- Status icon -->
            <div class="type {statusClass}" bind:this={statusIcon}></div>
        </div>
    </div>
</div>

<style>
    .p4-tools {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
    }

    .p4-tools .buttons {
        display: none;
        gap: 2px;
    }

    .tree-item-self:hover .p4-tools .buttons {
        display: flex;
    }

    .p4-tools .type {
        display: flex;
        align-items: center;
        justify-content: center;
        padding-left: var(--size-2-1);
    }

    .p4-tools .type :global(svg) {
        width: 14px;
        height: 14px;
    }

    /* Status color classes */
    .p4-tools .type.p4-status-add { color: var(--color-green); }
    .p4-tools .type.p4-status-edit { color: var(--color-blue); }
    .p4-tools .type.p4-status-delete { color: var(--color-red); }
    .p4-tools .type.p4-status-move { color: var(--color-orange); }
    .p4-tools .type.p4-status-branch { color: var(--color-cyan); }
    .p4-tools .type.p4-status-integrate { color: var(--color-purple); }
    .p4-tools .type.p4-status-locked { color: var(--color-yellow); }
</style>

