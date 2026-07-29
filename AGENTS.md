# AGENTS.md

This is the canonical instruction file for every coding agent working in this
repository. `CLAUDE.md` is a compatibility symlink to it.

## Working contract

- Start from the requested outcome and current repository evidence. Make
  reasonable, reversible assumptions; name uncertainty that could materially
  change the result.
- Keep changes narrow, complete, and easy to review. Preserve unrelated work.
- Treat code, schemas, tests, and checked-in data as authority. Keep observed
  behavior separate from fixtures, drafts, plans, and inference.
- Put durable product and engineering rules in code, tests, schemas, and the
  nearest documentation. Keep agent guidance thin and outcome-led.
- Use repository-native tools and verification proportional to risk. Never
  claim a check, render, deployment, or live behavior that was not verified.
- Commit completed implementation work with a message that says what changed
  and why. Report anything left uncommitted.
- Keep external writes, merge, deployment, publication, spend, communication,
  and private-data exposure behind explicit user intent.

## Agent tooling

- `.agents/` is canonical for shared agent assets.
- `.claude`, `.codex`, `.cursor`, and `.grok` are compatibility symlinks to
  `.agents`. Do not replace them with divergent files or directories.
- `.coderabbit.yaml` is a compatibility symlink to
  `.agents/.coderabbit.yaml`.
- Shared scaffolds live in `.agents/{agents,commands,hooks,rules,skills,workflows}`.
  Add content only when the repository has a real recurring need for it.
- Keep machine-local paths, credentials, caches, and generated scratch state
  out of Git.
- After changing this layout, run `.agents/check-layout.sh`.

## Repository-specific contract

This repository owns a collection of Grok Build desktop apps and their release
record.

- Each app lives at `apps/<slug>/` and owns its source, toolchain, lockfiles,
  checks, documentation, assets, and packaging.
- `apps/README.md` is the catalog and release ledger. Record release dates and
  X post URLs only after publication is verified.
- Read an app's README and nearest nested `AGENTS.md` for its exact commands
  and contracts.
