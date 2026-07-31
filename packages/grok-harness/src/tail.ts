// Byte-offset line tailer for grok's append-only JSONL session files.
//
// Contract with the writer (xai-grok-shell jsonl storage): appends are
// advisory-locked and flushed but NOT crash-atomic — the final line may be
// torn (healed by the next append), and whole lines can occasionally be
// corrupt. Readers buffer partial tails, skip unparseable lines, and re-stat
// by path because small state files are atomically replaced (new inode).
//
// The tailer is byte-oriented on purpose: it advances its offset by the
// bytes ACTUALLY returned (so short reads are safe) and only decodes
// complete lines (so multi-byte UTF-8 split across a poll boundary can't be
// corrupted by premature decoding).
//
// IO is injected so the package stays runtime-agnostic: Bun, Node, or a
// Tauri/Rust bridge can all provide TailIo.

// lib:ESNext-only package; TextDecoder exists in every target runtime.
declare class TextDecoder {
  decode(input: Uint8Array): string;
}

export type TailIo = {
  /** Size of the file in bytes, or null if it does not exist. */
  size: (path: string) => Promise<number | null>;
  /** Read bytes from [start, end). Returning FEWER bytes than requested is
   * allowed; the tailer advances by what it actually received. */
  read: (path: string, start: number, end: number) => Promise<Uint8Array>;
};

const BACKFILL_BYTES = 128 * 1024;
const NEWLINE = 0x0a;

export class Tail {
  private readonly io: TailIo;
  private readonly path: string;
  private offset: number;
  private buf = new Uint8Array(0);

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
        // Skip forward to the first line boundary so we never start mid-line.
        const probe = await this.io.read(this.path, this.offset, size);
        const nl = probe.indexOf(NEWLINE);
        this.offset += nl >= 0 ? nl + 1 : probe.length;
      }
    }
    if (size < this.offset) {
      // Truncated or rotated underneath us.
      this.offset = 0;
      this.buf = new Uint8Array(0);
    }
    if (size === this.offset) return;

    const chunk = await this.io.read(this.path, this.offset, size);
    if (chunk.length === 0) return;
    this.offset += chunk.length;

    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf, 0);
    joined.set(chunk, this.buf.length);
    this.buf = joined;

    const decoder = new TextDecoder();
    let start = 0;
    let nl = this.buf.indexOf(NEWLINE, start);
    while (nl >= 0) {
      const line = decoder.decode(this.buf.slice(start, nl)).trim();
      if (line !== "") onLine(line);
      start = nl + 1;
      nl = this.buf.indexOf(NEWLINE, start);
    }
    this.buf = this.buf.slice(start);
  }
}
