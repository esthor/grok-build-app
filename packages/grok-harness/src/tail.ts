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

export type TailStat = {
  size: number;
  /** Stable file identity (e.g. `dev:ino`), or null when the runtime can't
   * provide one. Identity changes signal atomic replacement. */
  id: string | null;
};

export type TailIo = {
  /** Stat the file, or null if it does not exist. */
  stat: (path: string) => Promise<TailStat | null>;
  /** Read bytes from [start, end). Returning FEWER bytes than requested is
   * allowed; the tailer advances by what it actually received. */
  read: (path: string, start: number, end: number) => Promise<Uint8Array>;
};

const BACKFILL_BYTES = 128 * 1024;
const NEWLINE = 0x0a;
/** Per-read ceiling: bounds peak memory when replaying a large log. The
 * drain loop below keeps reading until caught up, so per-poll semantics are
 * unchanged. */
const READ_CAP_BYTES = 4 * 1024 * 1024;

export class Tail {
  /** Set when the file shrank or was atomically replaced underneath us.
   * The owner must rebuild any state folded from this file — the tail
   * itself resumes per its mode, but counters folded before the reset are
   * stale. */
  truncated = false;

  private readonly io: TailIo;
  private readonly path: string;
  private readonly startAtEnd: boolean;
  private offset: number;
  private buf = new Uint8Array(0);
  private fileId: string | null = null;

  /** startAtEnd: begin ~128 KB before EOF (skipping the first partial line)
   * instead of replaying the whole file. */
  constructor(io: TailIo, path: string, startAtEnd: boolean) {
    this.io = io;
    this.path = path;
    this.startAtEnd = startAtEnd;
    this.offset = startAtEnd ? -1 : 0;
  }

  async poll(onLine: (line: string) => void): Promise<void> {
    // IO can reject between the stat and the read (file replaced mid-poll);
    // a tailer must treat that as "try again next tick", never throw into
    // its caller's timer.
    try {
      await this.pollInner(onLine);
    } catch {
      // Transient disk race; state is only advanced after successful reads.
    }
  }

  private async pollInner(onLine: (line: string) => void): Promise<void> {
    const st = await this.io.stat(this.path);
    if (st === null) return;
    const size = st.size;

    // Atomic replacement detection: a rename swaps the file identity, and
    // the replacement can be the same size or larger — the shrink check
    // alone would read garbage from the middle of the new file.
    if (this.fileId !== null && st.id !== null && st.id !== this.fileId && this.offset > 0) {
      this.truncated = true;
      this.offset = this.startAtEnd ? -1 : 0;
      this.buf = new Uint8Array(0);
    }
    if (st.id !== null) this.fileId = st.id;

    if (this.offset === -1) {
      this.offset = Math.max(0, size - BACKFILL_BYTES);
      if (this.offset > 0) {
        // Skip forward to the first line boundary so we never start
        // mid-line. Reads may return fewer bytes than requested, so keep
        // probing until a newline or EOF.
        while (this.offset < size) {
          const probe = await this.io.read(this.path, this.offset, size);
          if (probe.length === 0) break;
          const nl = probe.indexOf(NEWLINE);
          if (nl >= 0) {
            this.offset += nl + 1;
            break;
          }
          this.offset += probe.length;
        }
      }
    }
    if (size < this.offset) {
      // Truncated or rotated underneath us: flag the owner (its folded
      // state is now stale), then return to this tail's own mode — a
      // start-at-end tail re-runs its EOF sentinel (the recursive call
      // takes the offset === -1 branch above and continues from there);
      // a replay tail restarts from byte 0.
      this.truncated = true;
      this.offset = this.startAtEnd ? -1 : 0;
      this.buf = new Uint8Array(0);
      if (this.offset === -1) {
        await this.pollInner(onLine);
        return;
      }
    }

    // Drain in capped reads: bounds peak memory on a whole-file replay, and
    // short reads from the IO remain safe because the offset only advances
    // by bytes actually received.
    while (this.offset < size) {
      const end = Math.min(size, this.offset + READ_CAP_BYTES);
      const chunk = await this.io.read(this.path, this.offset, end);
      if (chunk.length === 0) return;
      this.offset += chunk.length;

      const joined = new Uint8Array(this.buf.length + chunk.length);
      joined.set(this.buf, 0);
      joined.set(chunk, this.buf.length);
      this.buf = joined;

      // Scan with a cursor and slice once at the end: re-slicing the whole
      // buffer per line is quadratic on a large replay chunk. `consumed`
      // advances before each delivery, so a throwing consumer can't cause
      // an already-delivered line to replay.
      const decoder = new TextDecoder();
      let consumed = 0;
      let nl = this.buf.indexOf(NEWLINE, consumed);
      while (nl >= 0) {
        const lineBytes = this.buf.subarray(consumed, nl);
        consumed = nl + 1;
        const line = decoder.decode(lineBytes).trim();
        if (line !== "") {
          try {
            onLine(line);
          } catch {
            // A consumer error must not corrupt tail state.
          }
        }
        nl = this.buf.indexOf(NEWLINE, consumed);
      }
      this.buf = consumed > 0 ? this.buf.slice(consumed) : this.buf;
    }
  }
}
