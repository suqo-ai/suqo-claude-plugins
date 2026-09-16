# Sync procedure: suqo-claude-plugins → downstream plugin ports

This is the **single, shared source of truth** for how a change to this repo
propagates to each downstream port (`suqo-codex-plugins`,
`suqo-cursor-plugins`, `suqo-antigravity-plugins`, and any future one). Every
sync routine — whether fired by a merged PR here or a weekly schedule — reads
*this file* and follows it, instead of carrying its own copy of these steps.

**Why this file exists, not three copies of its content**: this project has
already hit real bugs twice from the same class of mistake — a fix applied to
one downstream repo's CI/reconcile logic that didn't get carried to the
others (a YAML heredoc bug copy-pasted into all three repos' `check-source-
drift.yml`, and a stale-SHA fix that landed on `suqo-antigravity-plugins`
first and wasn't carried to `suqo-cursor-plugins` until a second review
caught it). Centralizing the *process* here — not the target-specific
commands, which genuinely differ per tool and stay in each repo's own
`tools/` scripts — closes that entire class of drift at the routine level.

If you are a routine (or a human) executing this: you were given a **target**
(one of the repos below) and a **plugin name** (the `--rename-to` value for
that target, e.g. `suqo-codex-plugins`). Follow the steps below exactly for
that target. If anything here conflicts with what a target repo's own
`tools/`/CI actually does, its committed scripts win — treat that as a sign
this doc is stale and say so in the PR/summary rather than guessing.

## Step-by-step procedure (same shape for every target)

1. **Clone `suqo-ai/suqo-claude-plugins` fresh**, from its actual current
   `main` on GitHub. Never reuse a cached/stale local copy — a stale source
   clone caused a real, embarrassing bug the first time this sync was done
   by hand. Also clone the **target** repo (default branch `main`).

2. **Convert** the source plugin using the target's tool — see the
   [per-target playbook](#per-target-playbook) below for the exact,
   CI-proven command. Never hand-write a Claude→target content mapping
   yourself; if the conversion tool errors or can't handle something, say so
   in the PR/summary rather than improvising a substitute.

3. **Reconcile** the converted output using the target repo's own
   `tools/reconcile-*.mjs` (or equivalent) scripts — again, see the
   per-target playbook for the exact invocation, including `--rename-to
   <plugin-name>` and any other required flags (some targets also need a
   `--description` override — check the target's own script `--help`/doc
   comment if unsure). **If a script the playbook expects is missing from
   the target repo, stop and say so instead of re-implementing the fix
   yourself** — that script existing is itself part of what's being
   verified.

4. **Place the converted output at the target repo's existing layout** —
   do not change this convention; see the per-target playbook for the exact
   paths. Every target's exact folder layout has already caused a real
   install-breaking bug once (mismatched nesting, a broken marketplace path)
   — do not reintroduce a fixed one.

5. **Regenerate the entire target output every time** — do not try to patch
   only what changed. Full regeneration is simpler and self-correcting, and
   makes the merged-PR trigger and the weekly drift-check trigger literally
   the same procedure.

6. **Verify with a real install before opening anything.** Install the
   target's CLI if it isn't already available, then run the exact
   verification command from the per-target playbook. **Never skip this
   step to save time** — it has already caught real bugs that pure
   content-diffing missed, on more than one target. If it fails, do not open
   a PR — open an issue (or, if a PR must be opened to show the failure,
   mark it draft and describe the exact error) so a human sees the break
   immediately. Clean up the test install/marketplace registration
   afterward either way.

7. **Diff** the regenerated tree against what's currently on the target
   repo's `main`.
   - No difference → do nothing. Do not open an empty PR.
   - An open PR from a previous run of this same routine already exists for
     the same content → update the existing one instead of duplicating it.

8. **If there's a real difference**, commit it on a new branch (a `claude/*`
   prefix is fine) and open a **draft** PR against the target's `main` with:
   - The exact source commit SHA of `suqo-claude-plugins` this was
     generated from
   - A short summary of what changed (which skill(s), which files, whether
     anything in the manifest needed reconciling)
   - Confirmation that the install-verification step (6) passed
   - Anything you were unsure how to map — state it explicitly rather than
     guessing silently

## Guardrails (apply to every target, no exceptions)

- Never hand-write a conversion mapping yourself — that's what step 2's tool
  is for.
- Never skip step 6 (the install test) to save time.
- Do not add a `package.json` or any dependency file to a target repo — every
  target (and the plugin it ships) must stay zero-dependency. Use `npx`
  directly for `acplugin`; don't install it as a project dependency.
- Full regeneration (step 5), not partial patching — keeps the merged-PR and
  weekly-schedule triggers identical.
- If this doc and a target's own committed scripts/CI disagree, the
  committed scripts win — flag the mismatch, don't silently pick one.

## Per-target playbook

### `suqo-codex-plugins` (tool: Codex, converter: `acplugin`)

```bash
npx --yes @disdjj/acplugin@1.7.0 convert <path-to-suqo-claude-plugins> \
  --all --to codex -o <scratch-dir>

node tools/reconcile-plugin-manifest.mjs \
  <path-to-suqo-claude-plugins>/.claude-plugin/plugin.json \
  <scratch-dir>/.codex-plugin/plugin.json \
  --rename-to suqo-codex-plugins

node tools/reconcile-marketplace-manifest.mjs \
  <scratch-dir>/.codex-plugin/plugin.json \
  <scratch-dir>/.agents/plugins/marketplace.json \
  <path-to-suqo-claude-plugins>/.claude-plugin/marketplace.json \
  suqo-claude-plugins --rename-to suqo-codex-plugins
```

**Output layout**: `plugins/suqo-codex-plugins/.codex-plugin/plugin.json` +
`plugins/suqo-codex-plugins/.agents/skills/<skill>/...` +
`.agents/plugins/marketplace.json` (nested under `plugins/<name>/` — Codex's
install fails outright if this doesn't match `marketplace.json`'s
`source.path`; this exact nesting was a real bug once, do not reintroduce it).

**Install verification**:
```bash
cd <target working copy>
codex plugin marketplace add .
codex plugin add suqo-codex-plugins@suqo-codex-plugins-marketplace --json
```
Confirm the JSON output shows `"installed"` succeeding, then clean up:
`codex plugin remove` / `codex plugin marketplace remove`.

### `suqo-cursor-plugins` (tool: Cursor, converter: `acplugin`)

```bash
npx --yes @disdjj/acplugin@1.7.0 convert <path-to-suqo-claude-plugins> \
  --all --to cursor -o <scratch-dir>

node tools/reconcile-plugin-manifest.mjs \
  <path-to-suqo-claude-plugins>/.claude-plugin/plugin.json \
  <scratch-dir>/.cursor-plugin/plugin.json \
  --rename-to suqo-cursor-plugins

node tools/reconcile-cursor-marketplace-manifest.mjs \
  <path-to-suqo-claude-plugins>/.claude-plugin/marketplace.json \
  <scratch-dir>/.cursor-plugin/marketplace.json \
  suqo-claude-plugins --rename-to suqo-cursor-plugins \
  --description "SUQO AI marketplace for SUQO Cursor plugins and skills."
```

**Output layout**: flat at the repo root — `.cursor-plugin/plugin.json`,
`.cursor-plugin/marketplace.json`, `skills/<skill>/...` (no `plugins/`
nesting, unlike Codex). The marketplace entry's `source` must be the literal
string `"./"` and `metadata.pluginRoot` must be absent — acplugin's raw
output gets both of these wrong (a real, pre-existing bug in its Cursor
writer, not something introduced here), which breaks
`agent plugin marketplace add` outright if not fixed by the reconcile script.

**Install verification**:
```bash
agent --plugin-dir <target working copy>
```
Confirm both skills (`php-sdk-usage`, `ts-sdk-usage`) are listed. (Cursor's
CLI has no separate non-interactive "install this one plugin" command —
`--plugin-dir` is the real, confirmed-working, non-interactive check.)

### `suqo-antigravity-plugins` (tool: Antigravity, importer: `agy` — no `acplugin`)

`acplugin` does have a `--to antigravity` option, but its output has no
`plugin.json` at all and fails `agy plugin validate` outright — confirmed by
actually running it. Use the official first-party importer instead:

```bash
agy plugin import <path-to-suqo-claude-plugins>
# imports to ~/.gemini/config/plugins/suqo-claude-plugins/

node tools/rename-plugin-manifest.mjs \
  ~/.gemini/config/plugins/suqo-claude-plugins/plugin.json \
  suqo-antigravity-plugins \
  --source <path-to-suqo-claude-plugins>/.claude-plugin/plugin.json \
  --description "Skills and SDK usage guides for building apps on top of the SUQO PHP and TypeScript SDKs."
```

**Output layout**: flat at the repo root — `plugin.json`, `skills/<skill>/...`
(same convention as Cursor). Keep only `plugin.json` and `skills/` from the
importer's raw output — it also copies `.git/`, `.claude/`,
`.claude-plugin/`, `LICENSE`, `README.md`, which are either Claude-specific
or redundant with the target repo's own.

**Install verification**:
```bash
agy plugin validate ~/.gemini/config/plugins/suqo-claude-plugins
agy plugin install ~/.gemini/config/plugins/suqo-claude-plugins
```
Confirm both succeed, then `agy plugin uninstall suqo-antigravity-plugins`.

**Note**: `agy` has no supported way to pin a version — the installer's
manifest URL is hardcoded, no version argument or env override. A future
`agy` release could change what `plugin import` produces for reasons
unrelated to any real content change. Accepted, not fixed — same tradeoff
this target's own CI documents.

## Adding a fourth target

Add a new subsection to the per-target playbook above (convert command,
output layout, install verification), following the same shape as the three
above. The step-by-step procedure and guardrails sections need no changes —
that's the point of keeping them generic.
