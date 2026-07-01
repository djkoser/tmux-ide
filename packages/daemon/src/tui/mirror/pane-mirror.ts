/**
 * A pane mirror: a headless terminal emulator fed by tmux control-mode
 * `%output` bytes, exposing a renderable grid snapshot.
 *
 * @xterm/headless is xterm.js without a DOM — a full VT parser (SGR, cursor,
 * alt-screen, scroll regions) maintaining a cell buffer. We write raw pane
 * bytes in and read the grid out; the TUI draws the snapshot. This is the
 * seam between "tmux owns the PTYs" and "tmux-ide owns the pixels".
 */
import { Terminal } from "@xterm/headless";

/** A run of same-colored text within a row. */
export interface StyledRun {
  text: string;
  /** 256-palette index, or null for the default foreground. */
  fg: number | null;
  bold: boolean;
}

export interface MirrorSnapshot {
  rows: StyledRun[][];
  cursorX: number;
  cursorY: number;
}

export class PaneMirror {
  private readonly term: Terminal;
  readonly cols: number;
  readonly rows: number;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 });
  }

  /** Feed raw pane bytes (UTF-8) from a control-mode %output event. */
  write(data: Uint8Array | string): void {
    this.term.write(data);
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  /** Read the visible grid as rows of same-styled runs (plus the cursor). */
  snapshot(): MirrorSnapshot {
    const buf = this.term.buffer.active;
    const rows: StyledRun[][] = [];
    const cell = buf.getNullCell();

    for (let y = 0; y < this.rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      const runs: StyledRun[] = [];
      if (line) {
        let text = "";
        let fg: number | null = null;
        let bold = false;
        for (let x = 0; x < this.cols; x++) {
          line.getCell(x, cell);
          const cellFg = cell.isFgDefault() ? null : cell.isFgPalette() ? cell.getFgColor() : null;
          const cellBold = cell.isBold() !== 0;
          if (x > 0 && (cellFg !== fg || cellBold !== bold) && text.length > 0) {
            runs.push({ text, fg, bold });
            text = "";
          }
          fg = cellFg;
          bold = cellBold;
          text += cell.getChars() || " ";
        }
        if (text.length > 0) runs.push({ text, fg, bold });
      }
      rows.push(runs);
    }
    return { rows, cursorX: buf.cursorX, cursorY: buf.cursorY };
  }

  dispose(): void {
    this.term.dispose();
  }
}
