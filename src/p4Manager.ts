import { exec } from "child_process";
import { promisify } from "util";
import { FileSystemAdapter, normalizePath } from "obsidian";
import * as path from "path";
import type ObsidianP4 from "./main";
import type {
    P4Action,
    P4BlameResult,
    P4BlameLine,
    P4Changelist,
    P4ConflictFile,
    P4DiffResult,
    P4FileStatus,
    P4HistoryEntry,
    P4Info,
    P4MergeVersions,
    P4RequirementsResult,
    P4ResolveAction,
    P4SyncedFile,
    P4SyncResult,
} from "./types";

const execAsync = promisify(exec);

/**
 * Manager class for all Perforce operations.
 * Wraps the p4 CLI and provides typed interfaces.
 */
export class P4Manager {
    private plugin: ObsidianP4;
    private clientRoot: string = "";
    private info: P4Info | null = null;

    constructor(plugin: ObsidianP4) {
        this.plugin = plugin;
    }

    /**
     * Get the path to the p4 executable
     */
    private get p4Path(): string {
        let p4Path = this.plugin.settings.p4Path || "p4";
        
        // If a directory path is given, append the appropriate executable name
        const isWindows = process.platform === "win32";
        const exeName = isWindows ? "p4.exe" : "p4";
        
        // Check if it looks like a directory path (doesn't end with executable)
        if (p4Path.includes("\\") || p4Path.includes("/")) {
            const lowerPath = p4Path.toLowerCase();
            if (!lowerPath.endsWith("p4.exe") && !lowerPath.endsWith("p4")) {
                p4Path = path.join(p4Path, exeName);
            }
        }
        
        return p4Path;
    }

    /**
     * Get the vault's base path
     */
    private get vaultPath(): string {
        const adapter = this.plugin.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            return adapter.getBasePath();
        }
        return "";
    }

    /**
     * Get environment variables for P4 commands
     */
    private getP4Env(): NodeJS.ProcessEnv {
        const env = { ...process.env };
        
        // Only set if configured in settings (allow env vars to take precedence if unset)
        if (this.plugin.settings.p4Port) {
            env.P4PORT = this.plugin.settings.p4Port;
        }
        if (this.plugin.settings.p4User) {
            env.P4USER = this.plugin.settings.p4User;
        }
        if (this.plugin.settings.p4Client) {
            env.P4CLIENT = this.plugin.settings.p4Client;
        }
        
        return env;
    }

    /**
     * Execute a p4 command and return the output
     */
    private async runP4(args: string[], cwd?: string): Promise<string> {
        const cmd = `"${this.p4Path}" ${args.join(" ")}`;
        const options = {
            cwd: cwd || this.vaultPath,
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            env: this.getP4Env(),
            timeout: 30000, // 30 second timeout to prevent freezing
        };

        console.log("P4 command:", cmd);

        try {
            const { stdout, stderr } = await execAsync(cmd, options);
            // Check if stderr contains error indicators even if stdout has content
            if (stderr && this.isP4Error(stderr)) {
                throw new Error(stderr);
            }
            return stdout;
        } catch (error) {
            const err = error as Error & { stderr?: string; killed?: boolean };
            if (err.killed) {
                throw new Error("P4 command timed out after 30 seconds");
            }
            throw new Error(err.stderr || err.message);
        }
    }

    /**
     * Check if stderr output indicates a real P4 error
     * P4 sometimes writes informational messages to stderr that aren't errors
     */
    private isP4Error(stderr: string): boolean {
        const errorPatterns = [
            /^error:/im,
            /^fatal:/im,
            /password.*invalid/i,
            /not logged in/i,
            /connect to server failed/i,
            /client.*unknown/i,
            /no such file/i,
        ];
        return errorPatterns.some(pattern => pattern.test(stderr));
    }

    /**
     * Execute a p4 command with JSON output (-Mj -ztag flags)
     * -ztag gives structured tagged output, -Mj marshals it as JSON
     */
    private async runP4Json<T>(args: string[], cwd?: string): Promise<T[]> {
        const output = await this.runP4(["-Mj", "-ztag", ...args], cwd);
        const results: T[] = [];

        // P4 JSON output is one JSON object per line
        const lines = output.trim().split("\n").filter(line => line.trim());
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                // Skip error objects if they're just "file(s) not opened" type messages
                if (parsed.code === "error" && parsed.data) {
                    continue;
                }
                results.push(parsed as T);
            } catch {
                // Skip non-JSON lines (like summary messages)
            }
        }
        console.log("P4 JSON results:", args[0], results);
        return results;
    }

    /**
     * Convert a vault-relative path to an absolute path
     */
    private toAbsolutePath(vaultPath: string): string {
        return path.join(this.vaultPath, vaultPath);
    }

    /**
     * Convert an absolute path to a vault-relative path
     */
    private toVaultPath(absolutePath: string): string {
        const relative = path.relative(this.vaultPath, absolutePath);
        return normalizePath(relative);
    }

    /**
     * Convert a depot path to a vault path using the client root
     */
    private depotToVaultPath(depotPath: string, clientFile?: string): string {
        if (clientFile) {
            return this.toVaultPath(clientFile);
        }
        return depotPath;
    }

    /**
     * Check if p4 is installed and workspace is configured
     */
    async checkRequirements(): Promise<P4RequirementsResult> {
        // Use a shorter timeout for requirement checks (5 seconds)
        const quickCheck = <T>(promise: Promise<T>): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<T>((_, reject) => 
                    setTimeout(() => reject(new Error("P4 check timed out")), 5000)
                )
            ]);
        };

        try {
            // Check if p4 is available (quick check)
            await quickCheck(this.runP4(["help"]));
        } catch {
            return "missing-p4";
        }

        try {
            // Check if we have a valid workspace
            const info = await quickCheck(this.getInfo());
            if (!info.clientName || info.clientName === "*unknown*") {
                return "not-in-workspace";
            }
            this.info = info;
            this.clientRoot = info.clientRoot;
        } catch (error) {
            const message = (error as Error).message || "";
            if (message.includes("Perforce password")) {
                return "not-logged-in";
            }
            return "not-in-workspace";
        }

        return "valid";
    }

    /**
     * Get p4 info (user, client, server)
     */
    async getInfo(): Promise<P4Info> {
        // With -ztag -Mj, p4 info returns proper JSON with field names
        interface P4InfoJson {
            userName?: string;
            clientName?: string;
            clientRoot?: string;
            serverAddress?: string;
            serverVersion?: string;
        }

        const results = await this.runP4Json<P4InfoJson>(["info"]);
        const data = results[0] || {};

        console.log("P4 info result:", data);

        return {
            userName: data.userName || "",
            clientName: data.clientName || "",
            clientRoot: data.clientRoot || "",
            serverAddress: data.serverAddress || "",
            serverVersion: data.serverVersion,
        };
    }

    /**
     * Get list of opened files (pending changes)
     */
    async getOpenedFiles(): Promise<P4FileStatus[]> {
        interface P4OpenedJson {
            depotFile?: string;
            clientFile?: string;
            action?: string;
            change?: string;
            type?: string;
            rev?: string;
            haveRev?: string;
        }

        try {
            // Get opened files - try without path restriction first (more reliable)
            // P4 returns all opened files for this client, we'll filter them later
            const results = await this.runP4Json<P4OpenedJson>(["opened"]);
            console.log("P4 opened raw results:", results);
            
            // Filter to only files in the vault
            const filesInVault: P4FileStatus[] = [];
            
            // Get client root to convert depot paths to local paths
            const info = this.info || await this.getInfo();
            const clientRoot = info.clientRoot.replace(/\\/g, "/");
            const clientName = info.clientName;
            const vaultPathNormalized = this.vaultPath.replace(/\\/g, "/").toLowerCase();
            
            console.log("P4 opened: clientRoot =", clientRoot, "clientName =", clientName, "vaultPath =", this.vaultPath);
            
            for (const item of results) {
                const clientFile = item.clientFile || "";
                console.log("P4 opened: clientFile =", clientFile);
                
                // clientFile format is //clientName/path/to/file
                // Convert to absolute path: clientRoot + path/to/file
                let absolutePath = clientFile;
                
                // Try to extract relative path by stripping //clientName/ prefix
                // The client name in the path might not exactly match what p4 info returns
                if (clientFile.startsWith("//")) {
                    // Find the second "/" after "//" to get the end of client name
                    const afterDoubleSlash = clientFile.substring(2);
                    const slashIndex = afterDoubleSlash.indexOf("/");
                    if (slashIndex !== -1) {
                        const relativePath = afterDoubleSlash.substring(slashIndex + 1);
                        absolutePath = `${clientRoot}/${relativePath}`;
                    }
                }
                
                console.log("P4 opened: absolutePath =", absolutePath);
                
                // Check if it's in the vault
                const absolutePathNormalized = absolutePath.toLowerCase();
                if (!absolutePathNormalized.startsWith(vaultPathNormalized)) {
                    console.log("P4 opened: skipping (not in vault):", absolutePath);
                    continue;
                }
                
                // Handle changelist - "default" stays as "default", numbers get parsed
                let changelist: number | "default" = "default";
                if (item.change && item.change !== "default") {
                    const parsed = parseInt(item.change, 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        changelist = parsed;
                    }
                }
                
                // Convert absolutePath to vault-relative path
                const vaultRelativePath = this.toVaultPath(absolutePath);
                console.log("P4 opened: vaultPath =", vaultRelativePath);
                
                filesInVault.push({
                    depotFile: item.depotFile || "",
                    clientFile: absolutePath,
                    vaultPath: vaultRelativePath,
                    action: (item.action || "edit") as P4Action,
                    changelist,
                    type: item.type,
                    rev: item.rev ? parseInt(item.rev, 10) : undefined,
                    haveRev: item.haveRev ? parseInt(item.haveRev, 10) : undefined,
                });
            }
            
            return filesInVault;
        } catch (error) {
            // "File(s) not opened" is not an error
            const message = (error as Error).message || "";
            if (message.includes("not opened")) {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get pending changelists
     */
    async getPendingChangelists(): Promise<P4Changelist[]> {
        interface P4ChangeJson {
            change?: string;
            desc?: string;
            user?: string;
            client?: string;
            status?: string;
            time?: string;
        }

        const info = this.info || await this.getInfo();
        const results = await this.runP4Json<P4ChangeJson>([
            "changes",
            "-s", "pending",
            "-u", info.userName,
            "-c", info.clientName,
        ]);

        const changelists: P4Changelist[] = results
            .filter(item => item.change && parseInt(item.change, 10) > 0)
            .map(item => ({
                change: parseInt(item.change!, 10),
                description: (item.desc || "").trim(),
                user: item.user || "",
                client: item.client || "",
                status: "pending" as const,
                date: item.time,
            }));

        // Add default changelist at the beginning
        changelists.unshift({
            change: "default",
            description: "Default changelist",
            user: info.userName,
            client: info.clientName,
            status: "pending",
        });

        return changelists;
    }

    /**
     * Check out a file for editing
     */
    async edit(filePath: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        await this.runP4(["edit", `"${absPath}"`]);
    }

    /**
     * Open a file for edit and lock it (exclusive checkout)
     */
    async editAndLock(filePath: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        await this.runP4(["edit", "-t", "+l", `"${absPath}"`]);
    }

    /**
     * Lock an already opened file
     */
    async lock(filePath: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        await this.runP4(["lock", `"${absPath}"`]);
    }

    /**
     * Add a new file to the depot
     */
    async add(filePath: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        await this.runP4(["add", `"${absPath}"`]);
    }

    /**
     * Mark a file for deletion
     */
    async delete(filePath: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        await this.runP4(["delete", `"${absPath}"`]);
    }

    /**
     * Revert changes to a file
     */
    async revert(filePath: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        await this.runP4(["revert", `"${absPath}"`]);
    }

    /**
     * Revert all changes in a changelist
     */
    async revertChangelist(changelist: number | "default"): Promise<void> {
        if (changelist === "default") {
            await this.runP4(["revert", "-c", "default", "//..."]);
        } else {
            await this.runP4(["revert", "-c", changelist.toString(), "//..."]);
        }
    }

    // ========== Folder Operations ==========

    /**
     * Add all files in a folder to the depot
     * Uses P4 wildcard syntax: path/...
     */
    async addFolder(folderPath: string): Promise<void> {
        const absPath = this.toAbsolutePath(folderPath);
        // Use forward slashes and wildcard for recursive matching
        const wildcard = absPath.replace(/\\/g, "/") + "/...";
        await this.runP4(["add", `"${wildcard}"`]);
    }

    /**
     * Check out all files in a folder for editing
     * Uses P4 wildcard syntax: path/...
     */
    async editFolder(folderPath: string): Promise<void> {
        const absPath = this.toAbsolutePath(folderPath);
        const wildcard = absPath.replace(/\\/g, "/") + "/...";
        await this.runP4(["edit", `"${wildcard}"`]);
    }

    /**
     * Mark all files in a folder for deletion
     * Uses P4 wildcard syntax: path/...
     */
    async deleteFolder(folderPath: string): Promise<void> {
        const absPath = this.toAbsolutePath(folderPath);
        const wildcard = absPath.replace(/\\/g, "/") + "/...";
        await this.runP4(["delete", `"${wildcard}"`]);
    }

    /**
     * Revert all changes in a folder
     * Uses P4 wildcard syntax: path/...
     */
    async revertFolder(folderPath: string): Promise<void> {
        const absPath = this.toAbsolutePath(folderPath);
        const wildcard = absPath.replace(/\\/g, "/") + "/...";
        await this.runP4(["revert", `"${wildcard}"`]);
    }

    /**
     * Move/rename a file in Perforce
     * The source file must be checked out first (or will be checked out automatically)
     */
    async move(oldPath: string, newPath: string): Promise<void> {
        const oldAbsPath = this.toAbsolutePath(oldPath);
        const newAbsPath = this.toAbsolutePath(newPath);
        
        // First ensure the file is checked out
        const isOpened = await this.isFileOpened(oldPath);
        if (!isOpened) {
            // Check out the file first
            await this.runP4(["edit", `"${oldAbsPath}"`]);
        }
        
        // Now move it
        await this.runP4(["move", `"${oldAbsPath}"`, `"${newAbsPath}"`]);
    }

    /**
     * Rename a file on the filesystem (used to revert accidental renames)
     */
    async revertRename(currentPath: string, originalPath: string): Promise<void> {
        const fs = require("fs").promises;
        const path = require("path");
        
        const currentAbsPath = this.toAbsolutePath(currentPath);
        const originalAbsPath = this.toAbsolutePath(originalPath);
        
        // Ensure parent directory exists
        const parentDir = path.dirname(originalAbsPath);
        await fs.mkdir(parentDir, { recursive: true });
        
        // Move file back
        await fs.rename(currentAbsPath, originalAbsPath);
    }

    /**
     * Update a changelist's description
     */
    async updateChangelistDescription(changelist: number, newDescription: string): Promise<void> {
        // Get current changelist spec
        const output = await this.runP4(["change", "-o", changelist.toString()]);
        
        // Parse and update the description in the spec
        // The spec format has "Description:" followed by indented lines
        const lines = output.split("\n");
        const newLines: string[] = [];
        let inDescription = false;
        let descriptionAdded = false;
        
        for (const line of lines) {
            if (line.startsWith("Description:")) {
                inDescription = true;
                newLines.push("Description:");
                // Add new description with proper indentation
                for (const descLine of newDescription.split("\n")) {
                    newLines.push("\t" + descLine);
                }
                descriptionAdded = true;
            } else if (inDescription) {
                // Skip old description lines (they start with tab)
                if (!line.startsWith("\t") && line.trim() !== "") {
                    inDescription = false;
                    newLines.push(line);
                }
            } else {
                newLines.push(line);
            }
        }
        
        if (!descriptionAdded) {
            throw new Error("Failed to parse changelist spec");
        }
        
        const newSpec = newLines.join("\n");
        
        // Submit the updated spec via stdin
        const { spawn } = require("child_process") as typeof import("child_process");
        const p4Process = spawn(this.p4Path, ["change", "-i"], {
            cwd: this.vaultPath,
            env: this.getP4Env(),
        });
        
        p4Process.stdin.write(newSpec);
        p4Process.stdin.end();
        
        await new Promise<void>((resolve, reject) => {
            let stderr = "";
            p4Process.stderr.on("data", (data: Buffer) => {
                stderr += data.toString();
            });
            p4Process.on("close", (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`p4 change -i failed: ${stderr}`));
                }
            });
            p4Process.on("error", reject);
        });
    }

    /**
     * Create a new numbered changelist
     */
    async createChangelist(description: string): Promise<number> {
        // Create a new changelist spec
        const spec = `Change: new\n\nDescription:\n\t${description.replace(/\n/g, "\n\t")}\n`;
        
        const { spawn } = require("child_process") as typeof import("child_process");
        const p4Process = spawn(this.p4Path, ["change", "-i"], {
            cwd: this.vaultPath,
            env: this.getP4Env(),
        });
        
        p4Process.stdin.write(spec);
        p4Process.stdin.end();
        
        return new Promise<number>((resolve, reject) => {
            let stdout = "";
            let stderr = "";
            p4Process.stdout.on("data", (data: Buffer) => {
                stdout += data.toString();
            });
            p4Process.stderr.on("data", (data: Buffer) => {
                stderr += data.toString();
            });
            p4Process.on("close", (code: number) => {
                if (code === 0) {
                    // Parse changelist number from output like "Change 12345 created."
                    const match = stdout.match(/Change (\d+) created/);
                    if (match && match[1]) {
                        resolve(parseInt(match[1], 10));
                    } else {
                        reject(new Error(`Failed to parse changelist number: ${stdout}`));
                    }
                } else {
                    reject(new Error(`p4 change -i failed: ${stderr}`));
                }
            });
            p4Process.on("error", reject);
        });
    }

    /**
     * Delete an empty changelist
     */
    async deleteChangelist(changelist: number): Promise<void> {
        await this.runP4(["change", "-d", changelist.toString()]);
    }

    /**
     * Sync files from the depot
     */
    async sync(filePath?: string): Promise<P4SyncResult> {
        interface P4SyncJson {
            depotFile?: string;
            clientFile?: string;
            action?: string;
            rev?: string;
            fileSize?: string;
        }

        // Sync specific file, or the vault directory (not entire workspace)
        let target: string;
        if (filePath) {
            target = `"${this.toAbsolutePath(filePath)}"`;
        } else {
            // Use proper P4 path syntax with forward slashes
            const vaultPathForP4 = this.vaultPath.replace(/\\/g, "/");
            target = `"${vaultPathForP4}/..."`;
        }
        
        console.log("P4 sync target:", target);
        const results = await this.runP4Json<P4SyncJson>(["sync", target]);

        const files: P4SyncedFile[] = results
            .filter(item => item.depotFile)
            .map(item => ({
                depotFile: item.depotFile || "",
                clientFile: item.clientFile || "",
                vaultPath: this.depotToVaultPath(item.depotFile || "", item.clientFile),
                action: this.mapSyncAction(item.action || ""),
                rev: parseInt(item.rev || "0", 10),
            }));

        return { files };
    }

    private mapSyncAction(action: string): P4SyncedFile["action"] {
        switch (action) {
            case "added": return "added";
            case "updated":
            case "refreshing": return "updated";
            case "deleted": return "deleted";
            default: return "upToDate";
        }
    }

    /**
     * Submit a changelist
     */
    async submit(changelist: number | "default", description?: string): Promise<number> {
        interface P4SubmitJson {
            submittedChange?: string;
        }

        let args: string[];
        if (changelist === "default") {
            if (!description) {
                throw new Error("Description is required for default changelist");
            }
            args = ["submit", "-d", `"${description}"`];
        } else {
            args = ["submit", "-c", changelist.toString()];
        }

        const results = await this.runP4Json<P4SubmitJson>(args);
        const submitted = results.find(r => r.submittedChange);
        return submitted && submitted.submittedChange ? parseInt(submitted.submittedChange, 10) : 0;
    }

    /**
     * Move files between changelists
     */
    async moveToChangelist(filePath: string, changelist: number | "default"): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);
        const clArg = changelist === "default" ? "default" : changelist.toString();
        await this.runP4(["reopen", "-c", clArg, `"${absPath}"`]);
    }

    /**
     * Get the content of a file from the depot (head revision)
     * Returns null if file is not in depot
     */
    async getDepotContent(filePath: string): Promise<string | null> {
        const absPath = this.toAbsolutePath(filePath);
        try {
            return await this.runP4(["print", "-q", `"${absPath}"`]);
        } catch {
            return null;
        }
    }

    /**
     * Get diff for a file
     */
    async diff(filePath: string): Promise<P4DiffResult> {
        const absPath = this.toAbsolutePath(filePath);
        
        // Get the diff output
        let diffText = "";
        try {
            diffText = await this.runP4(["diff", `"${absPath}"`]);
        } catch (error) {
            // No differences
            diffText = "";
        }

        // Get depot content for comparison
        let depotContent = "";
        try {
            depotContent = await this.runP4(["print", "-q", `"${absPath}"`]);
        } catch {
            depotContent = "";
        }

        // Get local content
        let localContent = "";
        try {
            localContent = await this.plugin.app.vault.adapter.read(filePath);
        } catch {
            localContent = "";
        }

        return {
            depotFile: absPath,
            localFile: filePath,
            depotContent,
            localContent,
            diffText,
        };
    }

    /**
     * Shelve files in a changelist
     */
    async shelve(changelist: number): Promise<void> {
        await this.runP4(["shelve", "-c", changelist.toString()]);
    }

    /**
     * Unshelve files from a changelist
     */
    async unshelve(changelist: number, targetChangelist?: number | "default"): Promise<void> {
        const args = ["unshelve", "-s", changelist.toString()];
        if (targetChangelist !== undefined) {
            args.push("-c", targetChangelist === "default" ? "default" : targetChangelist.toString());
        }
        await this.runP4(args);
    }

    /**
     * Delete shelved files
     */
    async deleteShelve(changelist: number): Promise<void> {
        await this.runP4(["shelve", "-d", "-c", changelist.toString()]);
    }

    /**
     * Get list of files synced in the vault (files we have locally from depot)
     * Returns a Set of vault-relative paths
     */
    async getHaveFiles(): Promise<Set<string>> {
        interface P4HaveJson {
            depotFile?: string;
            clientFile?: string;
            haveRev?: string;
        }

        const syncedFiles = new Set<string>();

        try {
            // Get files in the vault directory that we have synced
            const vaultPathForP4 = this.vaultPath.replace(/\\/g, "/");
            const results = await this.runP4Json<P4HaveJson>(["have", `"${vaultPathForP4}/..."`]);

            const info = this.info || await this.getInfo();
            const clientRoot = info.clientRoot.replace(/\\/g, "/");
            const vaultPathNormalized = this.vaultPath.replace(/\\/g, "/").toLowerCase();

            for (const item of results) {
                const clientFile = item.clientFile || "";
                
                // clientFile is in format //clientName/path or absolute path
                let absolutePath = clientFile;
                
                if (clientFile.startsWith("//")) {
                    const afterDoubleSlash = clientFile.substring(2);
                    const slashIndex = afterDoubleSlash.indexOf("/");
                    if (slashIndex !== -1) {
                        const relativePath = afterDoubleSlash.substring(slashIndex + 1);
                        absolutePath = `${clientRoot}/${relativePath}`;
                    }
                }
                
                // Normalize path for comparison (forward slashes, lowercase)
                const normalizedPath = absolutePath.replace(/\\/g, "/").toLowerCase();
                
                // Check if file is in vault
                if (normalizedPath.startsWith(vaultPathNormalized)) {
                    // Convert to vault-relative path using normalized paths for correct substring extraction
                    // We must use normalized path lengths to avoid issues with mixed case/slashes on Windows
                    let vaultRelative = normalizedPath.substring(vaultPathNormalized.length);
                    vaultRelative = vaultRelative.replace(/^\/+/, ""); // Remove leading slashes
                    syncedFiles.add(vaultRelative);
                }
            }
        } catch (error) {
            console.log("P4 have: Error getting synced files:", error);
            // Return empty set on error - non-critical
        }

        return syncedFiles;
    }

    /**
     * Get blame/annotate information for a file
     */
    async annotate(filePath: string): Promise<P4BlameResult> {
        const absPath = this.toAbsolutePath(filePath);
        
        // Use p4 annotate with -u (show user) and -c (show changelist)
        // Quote the path since runP4 joins arguments with spaces and paths may contain spaces
        const output = await this.runP4(["annotate", "-u", "-c", `"${absPath}"`]);
        
        console.log("P4 annotate raw output:", output.substring(0, 500));
        
        const lines: P4BlameLine[] = [];
        // Handle Windows line endings (\r\n) by removing \r
        const outputLines = output.replace(/\r/g, "").split("\n");
        
        // Track actual line number (some output lines may be headers)
        let lineNumber = 0;
        
        for (let i = 0; i < outputLines.length; i++) {
            const line = outputLines[i];
            if (!line || line.trim() === "") continue;
            
            // Skip depot file header line (e.g., "//depot/path/file.md - edit change 1234")
            if (line.startsWith("//")) continue;
            
            // Main format: changelist: user date [content]
            // Example: 48: mord4r 2025/11/08  - pojedyncze, powtarzalne zadania
            // Use a more permissive regex that captures everything after the date
            // Date can use / or - as separator
            const mainMatch = line.match(/^(\d+):\s*(\S+)\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})(.*)$/);
            if (mainMatch && mainMatch[1] && mainMatch[2] && mainMatch[3]) {
                lineNumber++;
                // Content is everything after the date, trimmed
                const content = (mainMatch[4] || "").replace(/^[\s:]+/, "").trim();
                console.log("P4 annotate: matched line", lineNumber, "changelist:", mainMatch[1], "user:", mainMatch[2], "date:", mainMatch[3]);
                lines.push({
                    lineNumber,
                    changelist: parseInt(mainMatch[1], 10),
                    user: mainMatch[2],
                    date: mainMatch[3],
                    content: content,
                });
                continue;
            }
            
            // Debug: log what we're trying to match
            console.log("P4 annotate: trying to match:", JSON.stringify(line.substring(0, 60)));
            
            // Alternate format: changelist: user date: content (colon after date)
            // Example: 12345: john 2024/01/15: line content here
            const match2 = line.match(/^(\d+):\s*(\S+)\s+(\d{4}\/\d{2}\/\d{2}):\s*(.*)$/);
            if (match2 && match2[1] && match2[2] && match2[3]) {
                lineNumber++;
                lines.push({
                    lineNumber,
                    changelist: parseInt(match2[1], 10),
                    user: match2[2],
                    date: match2[3],
                    content: (match2[4] || "").trim(),
                });
                continue;
            }
            
            // Simpler format without date: changelist: user: content
            const match3 = line.match(/^(\d+):\s*(\S+):\s*(.*)$/);
            if (match3 && match3[1] && match3[2]) {
                lineNumber++;
                lines.push({
                    lineNumber,
                    changelist: parseInt(match3[1], 10),
                    user: match3[2],
                    content: (match3[3] || "").trim(),
                });
                continue;
            }
            
            // Format 4: changelist - user date: content (dash separator)
            const match4 = line.match(/^(\d+)\s*-\s*(\S+)\s+(\d{4}\/\d{2}\/\d{2}):\s?(.*)$/);
            if (match4 && match4[1] && match4[2] && match4[3]) {
                lineNumber++;
                lines.push({
                    lineNumber,
                    changelist: parseInt(match4[1], 10),
                    user: match4[2],
                    date: match4[3],
                    content: match4[4] || "",
                });
                continue;
            }
            
            // Format 5: changelist: content (no user/date, basic format)
            const match5 = line.match(/^(\d+):\s*(.*)$/);
            if (match5 && match5[1]) {
                lineNumber++;
                lines.push({
                    lineNumber,
                    changelist: parseInt(match5[1], 10),
                    user: "unknown",
                    content: match5[2] || "",
                });
                continue;
            }
            
            // Format 6: user changelist date: content (alternate order)
            const match6 = line.match(/^(\S+)\s+(\d+)\s+(\d{4}\/\d{2}\/\d{2}):\s?(.*)$/);
            if (match6 && match6[1] && match6[2] && match6[3]) {
                lineNumber++;
                lines.push({
                    lineNumber,
                    changelist: parseInt(match6[2], 10),
                    user: match6[1],
                    date: match6[3],
                    content: match6[4] || "",
                });
                continue;
            }
            
            // Unmatched lines don't increment lineNumber - they're not content lines
            console.log("P4 annotate: unmatched line format:", line);
        }

        console.log("P4 annotate: parsed", lines.length, "lines");
        
        return {
            filePath,
            lines,
            fetchedAt: Date.now(),
        };
    }

    /**
     * Get description for a specific changelist
     */
    async getChangelistDescription(changelist: number): Promise<string> {
        interface P4DescribeJson {
            desc?: string;
        }

        try {
            const results = await this.runP4Json<P4DescribeJson>(["describe", "-s", changelist.toString()]);
            if (results.length > 0 && results[0]?.desc) {
                return results[0].desc.trim();
            }
        } catch {
            // Ignore errors
        }
        return "";
    }

    /**
     * Get submitted changelist history
     */
    async getHistory(maxResults: number = 50): Promise<P4HistoryEntry[]> {
        interface P4ChangesJson {
            change?: string;
            user?: string;
            client?: string;
            time?: string;
            desc?: string;
        }

        const results = await this.runP4Json<P4ChangesJson>([
            "changes",
            "-m", maxResults.toString(),
            "-s", "submitted",
            "-t", // Include time
            "...",
        ]);

        return results.map(item => ({
            change: parseInt(item.change || "0", 10),
            user: item.user || "",
            client: item.client || "",
            date: item.time || "",
            description: (item.desc || "").trim(),
        }));
    }

    /**
     * Get files in a submitted changelist
     */
    async getChangelistFiles(changelist: number): Promise<P4FileStatus[]> {
        interface P4DescribeJson {
            depotFile?: string;
            action?: string;
            rev?: string;
            type?: string;
        }

        const results = await this.runP4Json<P4DescribeJson>(["describe", "-s", changelist.toString()]);

        return results
            .filter(item => item.depotFile)
            .map(item => ({
                depotFile: item.depotFile || "",
                clientFile: "",
                vaultPath: item.depotFile || "",
                action: (item.action || "edit") as P4Action,
                changelist: changelist,
                type: item.type,
                rev: item.rev ? parseInt(item.rev, 10) : undefined,
            }));
    }

    /**
     * Check if a file is opened for edit
     */
    async isFileOpened(filePath: string): Promise<boolean> {
        const absPath = this.toAbsolutePath(filePath);
        try {
            const output = await this.runP4(["opened", `"${absPath}"`]);
            return output.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Check if a file exists in the depot (has been added/synced)
     */
    async isFileInDepot(filePath: string): Promise<boolean> {
        const absPath = this.toAbsolutePath(filePath);
        try {
            // p4 files will return info if the file is in the depot
            const output = await this.runP4(["files", `"${absPath}"`]);
            // If output contains the file path, it's in the depot
            return output.trim().length > 0 && !output.includes("no such file");
        } catch {
            return false;
        }
    }

    /**
     * Ensure a file is checked out (for auto-checkout feature)
     */
    async ensureCheckedOut(filePath: string): Promise<boolean> {
        if (await this.isFileOpened(filePath)) {
            return true;
        }

        try {
            await this.edit(filePath);
            return true;
        } catch {
            // File might not be in depot, try to add it
            try {
                await this.add(filePath);
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * Login to Perforce
     */
    async login(password: string): Promise<void> {
        // Use spawn with stdin to avoid shell injection vulnerabilities
        const { spawn } = await import("child_process");
        
        return new Promise((resolve, reject) => {
            const p4Process = spawn(this.p4Path || "p4", ["login"], {
                cwd: this.vaultPath,
                stdio: ["pipe", "pipe", "pipe"],
                env: this.getP4Env(),
            });

            let stderr = "";

            p4Process.stderr.on("data", (data: Buffer) => {
                stderr += data.toString();
            });

            p4Process.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(stderr || `p4 login failed with code ${code}`));
                }
            });

            p4Process.on("error", (err) => {
                reject(err);
            });

            // Write password to stdin and close it
            p4Process.stdin.write(password + "\n");
            p4Process.stdin.end();
        });
    }

    /**
     * Check login status
     */
    async isLoggedIn(): Promise<boolean> {
        try {
            await this.runP4(["login", "-s"]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the client/workspace root path
     */
    getClientRoot(): string {
        return this.clientRoot;
    }

    /**
     * Refresh cached info
     */
    async refresh(): Promise<void> {
        this.info = await this.getInfo();
        this.clientRoot = this.info.clientRoot;
    }

    // ========== Conflict Resolution ==========

    /**
     * Get list of files with unresolved conflicts
     * Uses `p4 resolve -n` to list files needing resolution
     */
    async getConflicts(): Promise<P4ConflictFile[]> {
        interface P4ResolveJson {
            clientFile?: string;
            fromFile?: string;
            startFromRev?: string;
            endFromRev?: string;
            baseRev?: string;
            resolveType?: string;
        }

        const conflicts: P4ConflictFile[] = [];

        try {
            // -n means preview (don't actually resolve), this shows what needs resolving
            const vaultPathForP4 = this.vaultPath.replace(/\\/g, "/");
            const results = await this.runP4Json<P4ResolveJson>(["resolve", "-n", `"${vaultPathForP4}/..."`]);

            const info = this.info || await this.getInfo();
            const clientRoot = info.clientRoot.replace(/\\/g, "/");
            const vaultPathNormalized = this.vaultPath.replace(/\\/g, "/").toLowerCase();

            for (const item of results) {
                const clientFile = item.clientFile || "";
                
                // Convert client file path to absolute path
                let absolutePath = clientFile;
                if (clientFile.startsWith("//")) {
                    const afterDoubleSlash = clientFile.substring(2);
                    const slashIndex = afterDoubleSlash.indexOf("/");
                    if (slashIndex !== -1) {
                        const relativePath = afterDoubleSlash.substring(slashIndex + 1);
                        absolutePath = `${clientRoot}/${relativePath}`;
                    }
                }

                // Check if in vault
                const absolutePathNormalized = absolutePath.toLowerCase();
                if (!absolutePathNormalized.startsWith(vaultPathNormalized)) {
                    continue;
                }

                const vaultRelativePath = this.toVaultPath(absolutePath);

                conflicts.push({
                    depotFile: item.fromFile || clientFile,
                    clientFile: absolutePath,
                    vaultPath: vaultRelativePath,
                    baseRev: parseInt(item.baseRev || "0", 10),
                    theirRev: parseInt(item.endFromRev || "0", 10),
                    conflictType: item.resolveType === "content" ? "content" : "action",
                    fromFile: item.fromFile,
                });
            }
        } catch (error) {
            // "No file(s) to resolve" is not an error
            const message = (error as Error).message || "";
            if (message.includes("No file(s) to resolve") || message.includes("no file(s) to resolve")) {
                return [];
            }
            // Don't throw on other errors, just return empty (conflicts are optional)
            console.log("P4 getConflicts error:", error);
        }

        return conflicts;
    }

    /**
     * Get the three versions of a conflicted file for merge
     * - base: common ancestor
     * - theirs: depot/submitted version  
     * - yours: local working version
     */
    async getConflictVersions(filePath: string): Promise<P4MergeVersions> {
        const absPath = this.toAbsolutePath(filePath);
        
        // Get local content (yours)
        let yours = "";
        try {
            yours = await this.plugin.app.vault.adapter.read(filePath);
        } catch {
            yours = "";
        }

        // Get depot head content (theirs)
        let theirs = "";
        try {
            theirs = await this.runP4(["print", "-q", `"${absPath}"`]);
        } catch {
            theirs = "";
        }

        // Get base version - this is trickier as P4 stores it during resolve
        // The base is typically the version you synced to before making changes
        // We can try to get it from p4 resolve -o or use have rev
        let base = "";
        try {
            // Try to get the version we have synced
            const haveOutput = await this.runP4(["have", `"${absPath}"`]);
            // Parse have output to get revision: //depot/path#rev - /local/path
            const match = haveOutput.match(/#(\d+)\s*-/);
            if (match && match[1]) {
                const haveRev = parseInt(match[1], 10);
                // Get content at that revision
                base = await this.runP4(["print", "-q", `"${absPath}#${haveRev}"`]);
            }
        } catch {
            // Fall back to depot head if we can't get base
            base = theirs;
        }

        return { base, theirs, yours };
    }

    /**
     * Resolve a conflict with the specified action
     * @param filePath - path to the file
     * @param action - resolution action
     * @param mergedContent - content for accept-merged (manual merge result)
     */
    async resolve(filePath: string, action: P4ResolveAction, mergedContent?: string): Promise<void> {
        const absPath = this.toAbsolutePath(filePath);

        switch (action) {
            case "accept-yours":
                // -ay: accept yours (keep local changes)
                await this.runP4(["resolve", "-ay", `"${absPath}"`]);
                break;
            
            case "accept-theirs":
                // -at: accept theirs (use depot version)
                await this.runP4(["resolve", "-at", `"${absPath}"`]);
                break;
            
            case "accept-merged":
                // For manual merge, we need to:
                // 1. Write the merged content to the file
                // 2. Run p4 resolve -am (accept merge) or -ae (accept edit)
                // Set flag to prevent handleFileModify from reverting our merge write
                this.plugin.isResolvingMerge = true;
                try {
                    if (mergedContent !== undefined) {
                        await this.plugin.app.vault.adapter.write(filePath, mergedContent);
                    }
                    // -ae: accept edit (accept the file as-is after manual edit)
                    await this.runP4(["resolve", "-ae", `"${absPath}"`]);
                } finally {
                    this.plugin.isResolvingMerge = false;
                }
                break;
            
            case "accept-safe-merge":
                // -as: accept safe merge (auto-merge if no conflicts, else fail)
                await this.runP4(["resolve", "-as", `"${absPath}"`]);
                break;
        }
    }

    /**
     * Attempt to auto-resolve all conflicts safely
     * Uses -as which only auto-merges if there are no actual conflicts
     */
    async resolveAllSafe(): Promise<{ resolved: string[]; failed: string[] }> {
        const resolved: string[] = [];
        const failed: string[] = [];

        const conflicts = await this.getConflicts();
        
        for (const conflict of conflicts) {
            try {
                await this.resolve(conflict.vaultPath, "accept-safe-merge");
                resolved.push(conflict.vaultPath);
            } catch {
                failed.push(conflict.vaultPath);
            }
        }

        return { resolved, failed };
    }
}

