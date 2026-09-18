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
(one of the repos below) and a **plugin name** (e.g. `suqo-codex-plugins`) —
how that name gets applied is target-specific (a `--rename-to` flag on
Codex/Cursor, a plain positional argument on Antigravity; see the per-target
playbook, never assume one shape fits all). Follow the steps below exactly
for that target.

**Everything in the per-target playbook below — pinned versions, literal
strings, and the argument count/order/flags of every command shown — is a
snapshot, not guaranteed current.** This is not hypothetical: this doc has
already been caught out of date once, when its Codex command was updated to
match a fix that was still an open, unmerged PR on `suqo-codex-plugins` at
the time — running the shown command against that target's actual `main`
at that moment would have broken with an "entry not found" error, because
`main`'s script still took one fewer argument. Before running a **convert or
reconcile** command, diff it against the target's own
`.github/workflows/verify-sync.yml`, which runs the same commands and is the
canonical copy for those. **The install-verification commands have no such
canonical copy for every target** — only Antigravity's CI actually runs an
install step; Codex's and Cursor's `verify-sync.yml` only convert, reconcile,
and diff, never install. For those two, the closest thing to canonical is
each target's own `README.md` "Install" section, which does carry a real,
previously-verified command — check that instead, and if even that looks
stale, say so rather than guessing. If anything here conflicts with what a
target repo's own `tools/`/CI/README actually does, those win.

## Step-by-step procedure (same shape for every target)

1. **Clone `suqo-ai/suqo-claude-plugins` fresh**, from its actual current
   `main` on GitHub. Never reuse a cached/stale local copy — a stale source
   clone caused a real, embarrassing bug the first time this sync was done
   by hand. Also clone the **target** repo (default branch `main`).

2. **Convert** the source plugin using the target's tool — see the
   [per-target playbook](#per-target-playbook) below for the exact,
   CI-proven command. Never hand-write a Claude→target content mapping
   yourself; if the conversion tool errors or can't handle something, say so
   in the PR/summary rather than improvising a substitute. **`rm -rf` every
   intermediate directory (scratch, pruned, import) immediately before
   writing to it, every run — never reuse one across runs.** Neither
   conversion tool cleans its own output directory on a second write, but
   they fail differently — confirmed by testing both directly, not assumed
   to be the same:
   - `acplugin -o <dir>`: **merges** into whatever's already there. A file
     removed upstream survives in a reused directory.
   - `agy plugin import`: without `--force`, a second import over an
     existing directory **doesn't even attempt to re-import at all** — it
     silently skips ("already imported, use --force to re-import"). Worse
     than a merge: the *entire* previous run's tree is what gets pruned and
     committed, not just one stale leftover.
   Either way, a reused directory's contents are what step 7 diffs and step
   8 commits — this applies to every intermediate directory in the
   per-target playbook below, not just the one this was first found on, and
   silently defeats step 5's "full regeneration is self-correcting" promise
   regardless of which of the two failure modes above actually happens.

3. **Reconcile** the converted output using the target repo's own
   `tools/reconcile-*.mjs` (or equivalent) scripts — see the per-target
   playbook for the exact invocation and flags for *this specific target*;
   they are not interchangeable (Antigravity's script has no `--rename-to`
   flag at all and hard-exits on any flag it doesn't recognize — passing it
   one anyway breaks the run, it does not silently ignore it). **If a
   script the playbook expects is missing from the target repo, stop and
   say so instead of re-implementing the fix yourself** — that script
   existing is itself part of what's being verified.

4. **Delete the target repo's existing output directories first, then place
   the regenerated output at the target's existing layout** — do not change
   this convention; see the per-target playbook for the exact paths and the
   `git rm -r`/`rm -rf` this step requires for that target. This is the same
   merge-vs-replace problem as step 2, one level further out: copying the
   regenerated tree onto the target's working copy is still a copy, not a
   sync, so a skill removed upstream would correctly be absent from the
   regenerated output but still survive in the target's committed working
   copy if its old directory is never deleted first — silently defeating
   step 5's "full regeneration is self-correcting" promise a second way.
   Every target's exact folder layout has also already caused a real
   install-breaking bug once (mismatched nesting, a broken marketplace path)
   — do not reintroduce a fixed one.

5. **Regenerate the entire target output every time** — do not try to patch
   only what changed. This is only actually self-correcting if step 4's
   delete-before-copy happens too — regeneration alone doesn't remove
   anything the target's working copy already has that the fresh output
   doesn't. Full regeneration also makes the merged-PR trigger and the
   weekly drift-check trigger literally the same procedure.

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
   - No difference in the converted output, but `.source-sync` (see step 8)
     is already up to date → do nothing. Do not open an empty PR.
   - No difference in the converted output, but `.source-sync` is *behind*
     the commit you generated from → the source moved without changing
     anything this target actually consumes (e.g. an edit to an unrelated
     file). Still commit a `.source-sync`-only bump and **open a PR for it
     per step 8, using the pointer-only banner and title described
     there** — otherwise the weekly drift check keeps flagging this target
     as behind forever, with no run of this procedure ever able to resolve
     it, since "no converted-output difference" would otherwise mean "do
     nothing" every single time. This carve-out is a real path a routine
     actually takes, not a hypothetical — say so explicitly, it does not
     exempt this PR from step 8's banner mandate just because it skipped
     step 8's other bullets about install-verification and skill summaries.
   - A real difference in the converted output → continue to step 8.
   - An open PR from a previous run of this same routine already exists for
     the same content → update the existing one instead of duplicating it.
     **Re-check which banner/title this update needs — don't assume the PR
     still is what it was when first opened.** A PR that started as a
     `.source-sync`-only bump (no plugin content changed) can turn into a
     real content update on a later run if something upstream changed in
     between, and vice versa is possible too. Rewrite the banner and title
     to match what's actually true *now*, every time you update an existing
     PR — a reviewer trusting a banner that was accurate when written but
     is now stale is worse than no banner at all.

8. **Commit the result** on a new branch (a `claude/*` prefix is fine),
   **including an updated `.source-sync` file** in the target repo's root —
   set it to the exact commit SHA of `suqo-claude-plugins` you generated
   from. This is not optional: every target's `verify-sync.yml` regenerates
   from whatever SHA `.source-sync` records and diffs the result against
   what's committed — skip this and CI fails on every single sync PR,
   because it's comparing against a stale pin. Then open a **draft** PR
   against the target's `main` with:
   - **The very first line of the PR body must be one of these two banners**
     — a reviewer should be able to tell which kind of PR this is without
     reading past line one. Copy these exactly, backticks included — each
     one is delimited with **double** backticks specifically so the literal
     single backtick around `.source-sync` inside it doesn't prematurely
     end the span (confirmed by rendering both through GitHub's own
     markdown API; a single-backtick version of this exact text renders
     broken, with a stray backslash and garbled trailing text — do not
     "simplify" this back to single backticks):
     - Real content change: ``> 🔁 **Content update.** This regenerates
       target content from a new source commit — see the changed files in
       this PR.``
     - `.source-sync`-only bump (step 7's carve-out): ``> 🔹 **Pointer-only
       update, no plugin content changed.** The source moved, but nothing
       this target's conversion consumes was touched — this PR only
       advances `.source-sync`.``
   - **The PR title follows the same content-vs-pointer-only split as the
     banner** — this is not currently checked by any target's CI (none of
     the six workflows across all three targets reference the PR's title
     or body — the only `pull_request` field any of them uses is
     `.number`, in a concurrency group — so a missing/wrong banner or
     title produces a green PR indistinguishable from a compliant one;
     this is enforced by review, not by a machine, until/unless that
     changes):
     - Pointer-only bump: prefix with `Bump .source-sync` and say `(no
       content change)`, e.g. `Bump .source-sync to
       suqo-claude-plugins@21d9e38 (no content change)`.
     - Real content change: `Sync <target> from
       suqo-claude-plugins@<sha>`, e.g. `Sync suqo-codex-plugins from
       suqo-claude-plugins@21d9e38`.
   - The exact source commit SHA of `suqo-claude-plugins` this was
     generated from (same one now in `.source-sync`)
   - A short summary of what changed (which skill(s), which files, whether
     anything in the manifest needed reconciling)
   - Confirmation that the install-verification step (6) passed
   - Anything you were unsure how to map — state it explicitly rather than
     guessing silently

   **Once this PR (or a `.source-sync`-only bump from step 7) merges,
   comment on and close any open drift issue on the target repo** (search
   for the title `check-source-drift.yml` uses — see that workflow for the
   exact string). The weekly drift check only opens/refreshes an issue when
   it finds drift; it has no corresponding "drift resolved, close it" path
   of its own, so a merge that fixes the drift doesn't make the issue go
   away on its own — it would sit open, asserting a now-false claim, until
   someone notices by hand.

## Guardrails (apply to every target, no exceptions)

- Never hand-write a conversion mapping yourself — that's what step 2's tool
  is for.
- Never skip step 6 (the install test) to save time.
- Never commit without updating `.source-sync` (step 8) — a sync commit that
  leaves it pointing at the old SHA fails that target's own CI, every time,
  by construction.
- Never reuse an intermediate directory across runs (step 2) — `rm -rf` it
  first, every time, for every scratch/pruned/import path in the per-target
  playbook. Confirmed by testing: none of this doc's conversion tools clean
  their own output directory on their own.
- Never copy the regenerated output onto the target's existing tree without
  deleting that tree first (step 4) — the same merge-vs-replace problem as
  the point above, one level further out. Copying onto an existing directory
  merges; it doesn't make the target match the regenerated output.
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
rm -rf <scratch-dir>
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
**Before copying the regenerated output in, delete the target's existing
`plugins/suqo-codex-plugins/` entirely** (`git rm -r` or `rm -rf`, then copy)
— a skill removed upstream would be correctly absent from the fresh output
but still survive in the target's working copy otherwise, since copying onto
an existing directory merges rather than replaces it, same as step 2's
intermediate directories. `.agents/plugins/marketplace.json` is a single
file, not a directory — overwriting it directly is fine, no delete needed.

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
rm -rf <scratch-dir>
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
**Before copying the regenerated output in, delete the target's existing
`skills/` directory entirely** (`git rm -r` or `rm -rf`, then copy) — same
merge-vs-replace reasoning as Codex above; a skill removed upstream needs
its old directory actually gone, not merged over. `.cursor-plugin/*.json`
are single files, safe to overwrite directly.

**Install verification**:
```bash
agent --plugin-dir <target working copy>
```
Confirm **every skill present in the source's `skills/` directory** is
listed — not a fixed list; if a skill is ever added or removed upstream,
this check should reflect that too, not silently keep passing against
whatever the list happened to be when this doc was written. (Cursor's CLI
has no separate non-interactive "install this one plugin" command —
`--plugin-dir` is the real, confirmed-working, non-interactive check.)

### `suqo-antigravity-plugins` (tool: Antigravity, importer: `agy` — no `acplugin`)

`acplugin` does have a `--to antigravity` option, but its output has no
`plugin.json` at all and fails `agy plugin validate` outright — confirmed by
actually running it. Use the official first-party importer instead.

**The import directory does not get cleaned up on its own.**
`~/.gemini/config/plugins/suqo-claude-plugins/` survives between separate
runs of `agy plugin import`, and without `--force`, a second import over an
existing directory doesn't even re-import at all — it silently skips
("already imported, use --force to re-import"), confirmed by running it
twice in a row. Delete it first, every time, so a file removed upstream
can't survive as a stale leftover and so this step actually refreshes at
all:

```bash
rm -rf ~/.gemini/config/plugins/suqo-claude-plugins

agy plugin import <path-to-suqo-claude-plugins>
# imports to ~/.gemini/config/plugins/suqo-claude-plugins/

node tools/rename-plugin-manifest.mjs \
  ~/.gemini/config/plugins/suqo-claude-plugins/plugin.json \
  suqo-antigravity-plugins \
  --source <path-to-suqo-claude-plugins>/.claude-plugin/plugin.json \
  --description "Skills and SDK usage guides for building apps on top of the SUQO PHP and TypeScript SDKs."
```

**Output layout**: flat at the repo root — `plugin.json`, `skills/<skill>/...`
(same convention as Cursor). **Before copying the pruned output into the
target repo's working copy, delete its existing `skills/` directory
entirely** — same merge-vs-replace reasoning as Codex/Cursor above.
`plugin.json` is a single file, safe to overwrite directly. The importer's
raw output also copies `.git/`, `.claude/`, `.claude-plugin/`, `LICENSE`,
`README.md`, which are either Claude-specific or redundant with the target
repo's own — **prune it into a separate, clean directory** before doing
anything else with it. `rm -rf` `<pruned-dir>` first, same as the import
directory above — `cp -r` merges into an existing directory rather than
replacing it, so reusing `<pruned-dir>` across runs reintroduces the exact
staleness bug the `rm -rf` on the import dir just closed, one step later
(confirmed by reproducing it):

```bash
rm -rf <pruned-dir>
mkdir -p <pruned-dir>
cp ~/.gemini/config/plugins/suqo-claude-plugins/plugin.json <pruned-dir>/
cp -r ~/.gemini/config/plugins/suqo-claude-plugins/skills <pruned-dir>/
```

`<pruned-dir>` — not the raw import — is what gets diffed against the
target repo and committed.

**Install verification**: run this against `<pruned-dir>`, not the raw
import. The raw import still has `.git/`/`.claude/`/etc. in it, which isn't
what actually ships — verifying the raw tree instead of the pruned one
means pruning could silently break something agy needs and this check
would still pass:
```bash
agy plugin validate <pruned-dir>
agy plugin install <pruned-dir>
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
