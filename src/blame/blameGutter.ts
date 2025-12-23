import { 
    EditorView,
    ViewPlugin,
    Decoration,
    WidgetType,
    type ViewUpdate,
    type DecorationSet,
} from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import type { P4BlameResult, P4BlameLine } from "../types";

/**
 * Effect to update blame data in the editor
 */
const setBlameData = StateEffect.define<P4BlameResult | null>();

/**
 * State field to store blame data
 */
const blameState = StateField.define<P4BlameResult | null>({
    create() {
        return null;
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setBlameData)) {
                return effect.value;
            }
        }
        return value;
    },
});

/**
 * Widget that displays inline blame annotation
 */
class InlineBlameWidget extends WidgetType {
    constructor(private blame: P4BlameLine) {
        super();
    }

    eq(other: InlineBlameWidget): boolean {
        return other.blame.changelist === this.blame.changelist &&
               other.blame.user === this.blame.user &&
               other.blame.lineNumber === this.blame.lineNumber;
    }

    toDOM(): HTMLElement {
        const el = document.createElement("span");
        el.className = "p4-inline-blame";
        
        // Format: "user • description (truncated) • date"
        const user = this.blame.user.length > 10 
            ? this.blame.user.substring(0, 10) + "…"
            : this.blame.user;
        
        // Get first line of description, truncated
        const desc = this.getShortDescription();
        
        let text = user;
        if (desc) {
            text += ` • ${desc}`;
        } else {
            text += ` • #${this.blame.changelist}`;
        }
        if (this.blame.date) {
            const formattedDate = this.formatDate(this.blame.date);
            text += ` • ${formattedDate}`;
        }
        
        el.textContent = text;
        
        // Full info in tooltip
        let tooltip = `Author: ${this.blame.user}\nChangelist: #${this.blame.changelist}`;
        if (this.blame.date) {
            tooltip += `\nDate: ${this.blame.date}`;
        }
        if (this.blame.description) {
            tooltip += `\n\n${this.blame.description}`;
        }
        el.title = tooltip;
        
        return el;
    }

    private getShortDescription(): string {
        if (!this.blame.description) return "";
        
        // Get first line only
        const firstLine = this.blame.description.split("\n")[0] || "";
        
        // Truncate to max 30 chars
        if (firstLine.length > 30) {
            return firstLine.substring(0, 30) + "…";
        }
        return firstLine;
    }

    private formatDate(dateStr: string): string {
        try {
            // P4 date format: YYYY/MM/DD
            const [year, month, day] = dateStr.split("/");
            const date = new Date(parseInt(year || "0"), parseInt(month || "1") - 1, parseInt(day || "1"));
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return "today";
            if (diffDays === 1) return "yesterday";
            if (diffDays < 7) return `${diffDays} days ago`;
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
            if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
            return `${Math.floor(diffDays / 365)} years ago`;
        } catch {
            return dateStr;
        }
    }

    ignoreEvent(): boolean {
        return true;
    }
}

/**
 * ViewPlugin that shows inline blame for the current line only
 */
const inlineBlamePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            // Rebuild decorations when cursor moves, document changes, or blame data changes
            if (update.selectionSet || update.docChanged || update.transactions.some(tr => tr.effects.some(e => e.is(setBlameData)))) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const blameData = view.state.field(blameState, false);
            if (!blameData || blameData.lines.length === 0) {
                return Decoration.none;
            }

            // Get the current cursor line
            const selection = view.state.selection.main;
            const cursorLine = view.state.doc.lineAt(selection.head);
            const lineNumber = cursorLine.number;

            // Find blame for current line
            const blameLine = blameData.lines.find(b => b.lineNumber === lineNumber);
            if (!blameLine) {
                return Decoration.none;
            }

            // Create inline widget at end of line
            const widget = Decoration.widget({
                widget: new InlineBlameWidget(blameLine),
                side: 1, // After the line content
            });

            return Decoration.set([widget.range(cursorLine.to)]);
        }
    },
    {
        decorations: v => v.decorations,
    }
);

/**
 * Create the complete inline blame extension for CodeMirror
 */
export function createBlameExtension(): Extension {
    return [
        blameState,
        inlineBlamePlugin,
    ];
}

/**
 * Update blame data in an editor view
 */
export function updateBlameInView(view: EditorView, blameData: P4BlameResult | null): void {
    view.dispatch({
        effects: setBlameData.of(blameData),
    });
}

/**
 * Get blame state from a view
 */
export function getBlameFromView(view: EditorView): P4BlameResult | null {
    return view.state.field(blameState, false) || null;
}
