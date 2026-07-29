#!/bin/sh

set -eu

fail() {
  printf '%s\n' "agent layout check failed: $*" >&2
  exit 1
}

expect_link() {
  link_path=$1
  expected_target=$2

  [ -L "$link_path" ] || fail "$link_path is not a symlink"
  actual_target=$(readlink "$link_path")
  [ "$actual_target" = "$expected_target" ] ||
    fail "$link_path points to $actual_target, expected $expected_target"
}

expect_link CLAUDE.md AGENTS.md
expect_link .coderabbit.yaml .agents/.coderabbit.yaml

for tool_dir in .claude .codex .cursor .grok; do
  expect_link "$tool_dir" .agents
done

for scaffold_dir in agents commands hooks rules skills workflows; do
  [ -d ".agents/$scaffold_dir" ] ||
    fail ".agents/$scaffold_dir is missing"
done

printf '%s\n' "agent layout check passed"
