import { MarkdownPostProcessorContext, Plugin, TFile } from 'obsidian';
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import {
	DEFAULT_SETTINGS,
	ComicScripterSettings,
	ComicScripterSettingTab,
} from './settings';

export let pluginSettings: ComicScripterSettings = DEFAULT_SETTINGS;
export let pluginFrontmatter: Record<string, unknown> = {};

// Check whether a line is a Page or Panel line, set a boolean to true.
function isPage(text: string): boolean {
  return text === "P" || text.toLowerCase() === "page" || text.toLowerCase() === "page:";
}
function isPanel(text: string): boolean {
  return text === "p" || text.toLowerCase() === "panel" || text.toLowerCase() === "panel:";
}
function isDialogue(text: string): boolean {
  return /^(.*?):/.test(text);
}

// Returns " L" or " R" based on page count and settings, or "" if handedness is off.
// If frontmatter contains "Page Start: Left/Right", that overrides flipHandedness.
function handednessLabel(pageCount: number, settings: ComicScripterSettings, frontmatter?: Record<string, unknown>): string {
  const pageStart = typeof frontmatter?.["Page Start"] === "string"
    ? frontmatter["Page Start"].toLowerCase()
    : null;
  // If no frontmatter override, respect the global handedness toggle
  if (pageStart === "none") return ""; 
  if (!pageStart && !settings.handedness) return "";
  // oddIsLeft: true means page 1 is L, false means page 1 is R
  let oddIsLeft: boolean;
  if (pageStart === "left" || pageStart === "l")       oddIsLeft = true;
  else if (pageStart === "right" || pageStart === "r") oddIsLeft = false;
  else                            oddIsLeft = settings.flipHandedness;
  const isOdd = pageCount % 2 === 1;
  return (isOdd === oddIsLeft) ? " L" : " R";
}

// Reading mode post-processor ////////////////////////////////////////////////////////////////////////////////////////////////////////////
const PAGE_ATTR    = "data-change-page-count";
const PANEL_ATTR   = "data-change-panel-count";

// Tracks whether ANY chunk has been processed for the current render pass.
// We reset counters only when this is absent (i.e. first chunk of a new render).
const RENDER_ATTR  = "data-change-render-id";

function processChunk(el: HTMLElement, settings: ComicScripterSettings, ctx: MarkdownPostProcessorContext) {
  const frontmatter = (ctx.frontmatter ?? {}) as Record<string, unknown>;
  const root =
    el.closest<HTMLElement>(".markdown-preview-view") ??
    el.closest<HTMLElement>(".markdown-rendered") ??
    (el.ownerDocument.body as HTMLElement);

  // Detect a fresh render: Obsidian clears the preview container before
  // re-rendering, so if there are no change-headings yet and no render ID
  // on this root, this must be the first chunk of a new pass; reset counters.
  const hasHeadings = root.querySelector(".change-heading") !== null;
  const hasRenderId = root.hasAttribute(RENDER_ATTR);

  // Honestly no clue what this part does
  if (!hasHeadings && !hasRenderId) {
    root.removeAttribute(PAGE_ATTR);
    root.removeAttribute(PANEL_ATTR);
  }

  root.setAttribute(RENDER_ATTR, "1");

  //This section is weird, but it was numbering wrong and needed each line to be distinct and not a part of one big paragraph.
  let changeCount = parseInt(root.getAttribute(PAGE_ATTR)  ?? "0", 10);
  let smallCount  = parseInt(root.getAttribute(PANEL_ATTR) ?? "0", 10);

  el.querySelectorAll("p").forEach((p) => {
    // Split the paragraph's child nodes on <br> boundaries into "line" groups.
    const lines: Node[][] = [[]];
    p.childNodes.forEach((node) => {
      if (node.nodeName === "BR") {
        lines.push([]);
      } else {
        lines[lines.length - 1]!.push(node);
      }
    });

    // The actual mongo important Reading Mode replacer. This also lets PDF's have proper exported headings.
    for (const lineNodes of lines) {
      const text = lineNodes.map((n) => n.textContent ?? "").join("").trim();

      if (isPage(text)) {
        changeCount++;
        smallCount = 0;
        const sideLabel = handednessLabel(changeCount, settings, frontmatter);

        if (lines.length === 1) {
          const h = document.createElement("h2");
          h.style.fontWeight = "bold";
          h.textContent = `PAGE ${changeCount}${sideLabel}`;
          if (settings.hrRule === true) {
            h.className = "change-heading change-heading-h2 change-heading-hr";
          } else {
            h.className = "change-heading change-heading-h2";
          }
          p.replaceWith(h);
        } else {
          lineNodes.forEach((n) => {
            const h = document.createElement("h2");
            h.style.fontWeight = "bold";
            h.textContent = `PAGE ${changeCount}${sideLabel}`;
            if (settings.hrRule === true) {
              h.className = "change-heading change-heading-h2 change-heading-hr";
            } else {
              h.className = "change-heading change-heading-h2";
            }
            n.parentNode?.replaceChild(h, n);
          });
        }
      } else if (isPanel(text)) {
        smallCount++;

        if (lines.length === 1) {
          const h = document.createElement("h4");
          if (settings.hrRule === true) {
            h.className = "change-heading change-heading-h4 change-heading-hr-panel";
          } else {
            h.className = "change-heading change-heading-h4";
          }
          h.style.fontWeight = "bold";
          h.style.paddingLeft = "20px";
          h.textContent = `Panel ${smallCount}`;
          p.replaceWith(h);
        } else {
          lineNodes.forEach((n) => {
            const h = document.createElement("h4");
            if (settings.hrRule === true) {
              h.className = "change-heading change-heading-h4 change-heading-hr-panel";
            } else {
              h.className = "change-heading change-heading-h4";
            }
            h.style.fontWeight = "bold";
            h.style.paddingLeft = "20px";
            h.textContent = `Panel ${smallCount}`;
            n.parentNode?.replaceChild(h, n);
          });
        }
      } else if (changeCount > 0 && isDialogue(text)) {
        lineNodes.forEach((n) => {
          const raw = n.textContent ?? "";
          const colonIdx = raw.indexOf(":");
          if (colonIdx === -1) return;

          const span = document.createElement("span");
          span.className = "change-heading-dialogue";
          span.textContent = raw.slice(0, colonIdx + 1);

          const after = document.createTextNode(raw.slice(colonIdx + 1));

          const wrapper = document.createElement("p");
          wrapper.appendChild(span);
          wrapper.appendChild(after);

          n.parentNode?.replaceChild(wrapper, n);
        });
      }
    }
  });

  // More utilities for making sure everything renders from the top.
  root.setAttribute(PAGE_ATTR,  String(changeCount));
  root.setAttribute(PANEL_ATTR, String(smallCount));

  // Clear the render ID after a short delay so the next genuine re-render
  // (switching notes) correctly resets counters from zero again.
  setTimeout(() => {
    root.removeAttribute(RENDER_ATTR);
  }, 500);
}

// Live-preview widget ////////////////////////////////////////////////////////////////////////////////////////////////////////////
class LivePreviewComicScripter extends WidgetType {
  constructor(private label: string, private level: "h2" | "h4", private hrRule: boolean) {
    super();
  }

  toDOM(): HTMLElement {
    const el = document.createElement(this.level);
    el.className = `change-heading change-heading-${this.level}`;
    if (this.level === "h2" && this.hrRule) {
        el.classList.add("change-heading-hr");
    }
    if (this.level === "h4") {
      el.classList.add("change-heading-hr-panel");
    }
    el.textContent = this.label;
    return el;
  }

  ignoreEvent(): boolean { return false; }
}

// HR widget (live preview, horizontal rule is built here to be injected as part of the main building loop)
class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement("hr");
    return el;
  }
  ignoreEvent(): boolean { return false; }
}

// CodeMirror view plugin (live preview) ////////////////////////////////////////////////////
class ChangeViewPlugin implements PluginValue {
  settings!: ComicScripterSettings;
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {}

  // Main Loop for Building the Decorations, only after cursor leaves the relevant lines
  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    // Accumulate all the lines that house the cursor.
    const cursorLines = new Set<number>();
    for (const range of view.state.selection.ranges) {
      const fromLine = doc.lineAt(range.from).number;
      const toLine   = doc.lineAt(range.to).number;
      for (let n = fromLine; n <= toLine; n++) cursorLines.add(n);
    }

    const lineNumbers = this.assignLineNumbers(doc);

    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = doc.lineAt(pos);
        const info = lineNumbers.get(line.number);

        if (info) {
          if (info.level === "dialogue") {
            // Mark just the "NAME:" prefix — safe to apply even with cursor on line
            const prefixLen = info.prefix!.length;
            builder.add(
              line.from,
              line.from + prefixLen,
              Decoration.mark({ class: "change-heading-dialogue" })
            );
          } else if (!cursorLines.has(line.number)) {
            builder.add(
              line.from,
              line.to,
              Decoration.replace({
                widget: new LivePreviewComicScripter(info.label, info.level, pluginSettings.hrRule),
                inclusive: false,
              })
            );
          }
        }

        pos = line.to + 1;
      }
    }

    return builder.finish();
  }

  // Assign Line Numbers, reset Panel after every Page
  private assignLineNumbers(
    doc: EditorView["state"]["doc"]
  ): Map<number, { label: string; level: "h2" | "h4" | "dialogue"; prefix?: string }> {
    const map = new Map<number, { label: string; level: "h2" | "h4" | "dialogue"; prefix?: string }>();
    let changeCount = 0;
    let smallCount = 0;

    for (let i = 1; i <= doc.lines; i++) {
      const text = doc.line(i).text.trim();

      if (isPage(text)) {
        changeCount++;
        smallCount = 0;
        const sideLabel = handednessLabel(changeCount, pluginSettings, pluginFrontmatter);
        map.set(i, { label: `PAGE ${changeCount}${sideLabel}`, level: "h2" });
      } else if (isPanel(text)) {
        smallCount++;
        map.set(i, { label: `Panel ${smallCount}`, level: "h4" });
      } else if (changeCount > 0 && isDialogue(text)) {
        const prefix = text.match(/^(.*?:)/)?.[1] ?? "";
        map.set(i, { label: text, level: "dialogue", prefix });
      }
    }

    return map;
  }
}

const changePluginSpec: PluginSpec<ChangeViewPlugin> = {
  decorations: (plugin) => plugin.decorations,
};

const changeExtension = ViewPlugin.fromClass(ChangeViewPlugin, changePluginSpec);

// Obsidian Plugin Wrapper ////////////////////////////////////////////////////////////////////////////////////////////////////////////
export default class ComicScripter extends Plugin {
  settings!: ComicScripterSettings;
  async onload() {

    await this.loadSettings();
    this.registerEditorExtension(changeExtension);

    // Keep pluginFrontmatter in sync with the active file for live preview
    const syncFrontmatter = (file: TFile | null) => {
      if (!file) { pluginFrontmatter = {}; return; }
      pluginFrontmatter = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
    };
    syncFrontmatter(this.app.workspace.getActiveFile());
    this.registerEvent(this.app.workspace.on("file-open", syncFrontmatter));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (file === this.app.workspace.getActiveFile()) syncFrontmatter(file);
    }));

    this.registerMarkdownPostProcessor((el, ctx) => {
      processChunk(el, this.settings, ctx);
    });

    this.addSettingTab(new ComicScripterSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ComicScripterSettings>,
    );
    pluginSettings = this.settings;
  }
  
  async saveSettings() {
    await this.saveData(this.settings);
    pluginSettings = this.settings;
  }  
}