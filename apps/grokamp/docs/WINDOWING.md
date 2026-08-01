# WINDOWING.md — why Grokamp tiles, and how

Requirement: **windows may never overlap, they snap into place, and it has to
feel intuitive.** Free-positioned windows with magnetic edges (what Winamp
actually did, and what Grokamp shipped first) cannot satisfy the first clause
— magnetism is a hint, not a guarantee, and any two windows can always be
dropped on top of each other. So the model had to change. This is the
homework behind that change.

## Prior art, and what each one teaches

| System | Model | What it gets right | Why not verbatim |
|---|---|---|---|
| **Winamp** (1997) | free x/y + 10px magnetic docking, docked group moves together | the *feel* of snapping; window shade | overlap is legal — fails the requirement |
| **i3 / sway** | tree of h/v containers, explicit split direction | zero overlap by construction; keyboard-first | modal split-then-open is unintuitive for mouse users |
| **bspwm** | binary space partition, insert at focused node | simple, predictable geometry | insertion rules are invisible to the user |
| **dwm** | master + stack | dead simple | rigid; bad for 9 heterogeneous panes |
| **Windows Snap Layouts / macOS tiling** | drag to edge/corner → half/quarter | *extremely* learnable: drag toward where you want it | coarse (halves/quarters only); doesn't compose deeply |
| **PowerToys FancyZones** | predefined zones, highlight on hover | the hover-highlight teaching moment | multiple windows per zone → overlap returns |
| **VS Code / Obsidian** | nested split panes, drag to a pane's edge to split, center to move | discoverable, composes arbitrarily deep, no overlap | — (this is the model) |
| **react-mosaic / Golden Layout** | BSP tree + drop-zone overlay, draggable dividers | proves the model in a browser, in React | — (this is the model) |

The convergent answer across every system that *guarantees* no overlap and is
still liked by mouse users: **a binary space-partition tree plus a
drop-zone overlay.** VS Code, Obsidian, Golden Layout, and react-mosaic all
land here independently. Grokamp adopts it.

## The model

```
Node = Leaf { id }
     | Split { dir: row|col, ratio, a: Node, b: Node }
```

Every pixel of the workspace belongs to exactly one leaf. Overlap is not
"prevented" — it is **unrepresentable**. Gaps are likewise impossible: a
split's children always consume its full extent (`ratio` + `1 - ratio`).

Splits are addressed by **path** (`""`, `"a"`, `"ab"`, …) rather than by a
generated id, so the tree stays plain, comparable, serializable data with no
identity bookkeeping.

## The five interaction decisions

These are the parts that make or break intuitiveness.

1. **Show the outcome before committing.** While dragging, the leaf under the
   pointer displays a translucent ghost of *exactly* the rect the window will
   occupy on release, plus a label (`SPLIT LEFT`, `SWAP`). No guessing, no
   surprise. This single feature is why VS Code's splitting feels obvious and
   i3's `$mod+v` then open does not.
2. **Five zones per target, biased to the edges.** Outer 30% of each side
   (clamped 28–110px) splits into that side; the middle **swaps** the two
   windows. Edge-splitting matches Snap Layouts muscle memory; center-swap is
   the cheap way to rearrange without restructuring, and it's what people
   reach for first when two panes are simply in the wrong places.
3. **Drag past the workspace edge to dock against the whole side.** Dropping
   in the outer margin puts the window against that entire edge — the
   Windows/macOS idiom, and the escape hatch when every leaf is small. The
   margin is deliberately **thin (12px)**: panes sit flush against the
   workspace boundary, so a fat margin would shadow the top/left zones of
   every border pane and make them unsplittable. Playtesting caught exactly
   that — a pointer 6px from the top docked to the root when the intent was
   to split the pane it was over. Thin margin + the distinct ghost (full-span
   rect, `DOCK TOP` vs `SPLIT TOP`) resolves it without a hidden modifier.
4. **Dividers, not window edges, resize.** Grab the gutter between two panes;
   both neighbors adjust; the rest of the layout is untouched. Minimum leaf
   size is enforced, so a drag can never collapse a window to nothing.
5. **Predictable open/close.** Opening a window splits the **largest** leaf
   along its **longer** axis (so you get a sane rectangle, not a sliver).
   Closing a leaf hands its space to its sibling — the layout heals with no
   gap and no reshuffle of unrelated panes.

## Rigid leaves — the pixel-perfect exception

A classic Winamp skin is 275×116, period. Stretching it would betray the
whole point of the head unit, so leaves may declare an **intrinsic size per
axis**:

- **HEAD UNIT**: rigid on both axes (550×232 at our 2× scale).
- **Shaded (windowshade) windows**: rigid on the vertical axis at titlebar
  height — Winamp's roll-up, now a first-class layout state.

When a split has one rigid child, the rigid child gets exactly its intrinsic
size and the flexible sibling absorbs the remainder; the stored `ratio` is
ignored on that axis. When both are rigid, the first wins and the second
takes what's left. Rigid leaves are centered in their cell and never scaled,
so `.wsz` art stays pixel-exact at any workspace size.

## Keyboard

`Alt+1…9` toggle windows. `Alt+Shift+←/→/↑/↓` move the focused window in the
tree (i3 muscle memory — swap with the neighbor in that direction). Focus
follows the pointer for drags and click-to-focus for chrome.

## What was removed

`src/wm/snap.ts` (magnetic free positioning, the 10px→20px snap threshold)
and its tests are gone: with a partition tree there are no free coordinates
to snap. The 10px docking distance survives as documented Winamp history in
[WINAMP.md](./WINAMP.md), not as behavior. `src/wm/tile.ts` replaces it, with
tests covering rect computation, rigid sizing, insert/remove/swap/move, zone
detection, and ratio clamping.
