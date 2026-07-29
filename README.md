# Grok Build Apps

A growing collection of desktop interfaces for Grok Build, released one at a
time on X.

## Structure

- `apps/<slug>/` contains one self-contained app: source, dependencies,
  lockfiles, tests, documentation, assets, and packaging.
- `apps/README.md` is the catalog and release ledger.

Keep the repository root toolchain-free. Add shared infrastructure only after
multiple shipped apps prove that they need the same thing.
