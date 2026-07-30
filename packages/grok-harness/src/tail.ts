// Byte-offset line tailer for grok's append-only JSONL session files.
//
// Contract with the writer (xai-grok-shell jsonl storage): appends are
// advisory-locked and flushed but NOT crash-atomic — the final line may be
// torn (healed by the next append), and whole lines can occasionally be
// corrupt. Readers buffer partial tails, skip unparseable lines, and re-stat
// by path because small state files are atomically replaced (new inode).
//
// IO is injected so the package stays runtime-agnostic: Bun, Node, or a
// Tauri/Rust bridge can all provide TailIo.

export type TailIo = {
  /** Size of the file in bytes, or null if it does not exist. */
  size: (path: string) => Promise<number | null>;
  /** Read [start, end) as UTF-8 text. */
  read: (path: string, start: number, end: number) => Promise<string>;
};

const BACKFILL_BYTES = 128 * 1024;

export class Tail {
  private readonly io: TailIo;
  private readonly path: string;
  private offset: number;
  private buf = "";

  /** startAtEnd: begin ~128 KB before EOF (skipping the first partial line)
   * instead of replaying the whole file. */
  constructor(io: TailIo, path: string, startAtEnd: boolean) {
    this.io = io;
    this.path = path;
    this.offset = startAtEnd ? -1 : 0;
  }

  async poll(onLine: (line: string) => void): Promise<void> {
    const size = await this.io.size(this.path);
    if (size === null) return;

    if (this.offset === -1) {
      this.offset = Math.max(0, size - BACKFILL_BYTES);
      if (this.offset > 0) {
        const text = await this.io.read(this.path, this.offset, size);
        const nl = text.indexOf("\n");
        this.offset += nl >= 0 ? nl + 1 : text.length;
      }
    }
    if (size < this.offset) {
      // Truncated or rotated underneath us.
      this.offset = 0;
      this.buf = "";
    }
    if (size === this.offset) return;

    const chunk = await this.io.read(this.path, this.offset, size);
    this.offset = size;
    this.buf += chunk;
    let nl = this.buf.indexOf("\n");
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line !== "") onLine(line);
      nl = this.buf.indexOf("\n");
    }
  }
}
