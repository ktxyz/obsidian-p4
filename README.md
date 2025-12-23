# Obsidian P4

A Perforce (Helix Core) integration plugin for [Obsidian](https://obsidian.md), bringing version control features directly into your note-taking workflow.

> **️Early Development:** This plugin is in early development and may be buggy. If you encounter issues, please [file an issue](../../issues) on GitHub. Pull requests are welcome!

## Features

### File Operations
- **Auto-checkout on edit** - Automatically checks out files when you start editing
- **Auto-add new files** - Optionally add new files to Perforce automatically
- **Context menu integration** - Right-click files or folders for P4 operations (Add, Check out, Revert, Delete)
- **Folder operations** - Batch operations on entire folders

### Source Control View
- **Sidebar panel** - View all pending changes organized by changelist
- **File status decorators** - Visual indicators in the file tree showing P4 status (checked out, added, etc.)
- **Changelist management** - Create, edit, and submit changelists
- **Conflict resolution** - Built-in merge UI for resolving conflicts

### History & Blame
- **File history** - View revision history for any file
- **Diff view** - Compare file versions side-by-side
- **Blame annotations** - See per-line author information in the editor gutter

### Supported File Types
- Markdown files (`.md`)
- Canvas files (`.canvas`)
- Other text-based files

## Requirements

- **Desktop only** - Linux and Windows are officially supported. macOS might work but is untested.
- **Perforce CLI (p4)** - Must be installed and accessible in your system PATH
- **Valid P4 workspace** - Your Obsidian vault must be within a Perforce workspace
- **P4 environment** - `P4PORT`, `P4USER`, and `P4CLIENT` should be configured (via environment variables, `.p4config`, or plugin settings)
- **No sandboxing** - Snap, Flatpak, and other sandboxed installations are not supported. The plugin requires direct access to the `p4` binary and your filesystem.

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder named `obsidian-p4` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Restart Obsidian
5. Enable the plugin in **Settings → Community plugins**

## Configuration

Open **Settings → Obsidian P4** to configure:

| Setting | Description |
|---------|-------------|
| P4 executable path | Path to `p4` command (default: `p4`) |
| Auto checkout | Automatically check out files when editing |
| Auto add | Automatically add new files to Perforce |
| Show notifications | Display P4 operation notifications |
| Enable file decorators | Show P4 status icons in file tree |
| Enable blame | Show per-line author annotations |

## Usage

### Commands

Access via Command Palette (`Ctrl/Cmd + P`):

- `P4: Open source control view` - Open the P4 sidebar
- `P4: Sync` - Get latest files from server
- `P4: Add current file` - Add active file to Perforce
- `P4: Check out current file` - Check out active file for editing
- `P4: Revert current file` - Revert changes to active file
- `P4: Show file history` - View revision history
- `P4: Show blame` - Toggle blame annotations
- `P4: Submit` - Submit pending changes
- `P4: Login` - Re-authenticate with Perforce

### Context Menu

Right-click any file or folder in the file explorer to access P4 operations.

### Status Bar

The status bar shows:
- Number of pending files
- Current P4 operation status
- Click to open source control view

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build
```

## Acknowledgments

This plugin is heavily inspired by [Obsidian Git](https://github.com/Vinzent03/obsidian-git) by Vinzent03 - Git integration plugin for Obsidian. If you use Git instead of Perforce, check it out!

## Contributing

This plugin is in early development and contributions are welcome!

- **Bug reports** - [Open an issue](../../issues) with steps to reproduce
- **Feature requests** - [Open an issue](../../issues) describing the feature
- **Pull requests** - Fork the repo, make your changes, and submit a PR

## License

MIT License - see [LICENSE](LICENSE) for details.
