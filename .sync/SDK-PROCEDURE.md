# SDK sync procedure: suqo-sdk-ts / suqo-sdk-php → this repo's skills

This is the **single, shared source of truth** for keeping `skills/ts-sdk-usage`
and `skills/php-sdk-usage` in sync with the real SDKs they document. It is the
mirror-image of `.sync/PROCEDURE.md` (which propagates *this* repo outward to
the downstream plugin ports) — this one propagates changes *inward*, from
`suqo-ai/suqo-sdk-ts` and `suqo-ai/suqo-sdk-php` into this repo.

**Why one shared doc, not two per-language ones**: same reasoning as
`.sync/PROCEDURE.md` itself — this org has already hit real drift bugs from
near-duplicate copies of the same process diverging. The two SDKs differ
enough in their verification tooling (`tsc` vs `phpstan`) to need separate
playbook sections, but the shared philosophy — check the published package,
not git source; never trust a mechanical pass as proof prose is accurate;
always draft, never auto-merge prose — must not fork into two copies that
can drift from each other.

## Why this is a fundamentally different problem than the downstream sync

The downstream sync (`.sync/PROCEDURE.md`) is mechanical format conversion:
`acplugin`/`agy` deterministically transform this repo's content, and a real
install proves the result works. There is no equivalent tool that
deterministically transforms SDK source into skill prose — writing
`SKILL.md`/`references/*.md` is a judgment call, not a conversion.

So this procedure has two tiers with genuinely different trust levels:

- **Tier 1 — code templates** (`templates/*.ts`, `*.php`): mechanically
  verifiable. Install the real, published SDK version and compile/analyze the
  templates against it. A failure is real, undeniable proof of drift — not an
  opinion.
- **Tier 2 — prose** (`SKILL.md`, `references/*.md`): not mechanically
  verifiable. There is no compiler for "is this sentence still true." This
  tier only ever produces a **draft PR for human review** — never trust it
  the way Tier 1 is trusted, and never skip Tier 2 just because Tier 1 passed
  (a type becoming nullable, for example, can pass every compiler check while
  making a reference doc's stated type wrong).

## The one rule that matters more than any other: published, not git `main`

**Always check what's actually installable — the npm registry for
`@suqo/sdk`, Packagist for `suqo/sdk-php` — never a git clone's `main`
branch, and never a `CHANGELOG.md` entry that hasn't been released yet.**

This is not a hypothetical caution. It already happened once, for real: a
fix to this exact skill documented `Customer.id` as a `string` (plus a new
`Customer.address` field) by cloning `suqo-sdk-ts`'s git repo and reading its
current source — which was ahead of what's published. The actual
`@suqo/sdk@1.0.0` on npm (the only version anyone can actually install)
still has `Customer.id: number` and no `address` field; that change sits
under `suqo-sdk-ts`'s own `CHANGELOG.md` `[Unreleased]` section, explicitly
flagged as breaking and requiring an unpublished `2.0.0`. Documenting an
unreleased SDK version as current fact is a real bug, in the opposite
direction of "the docs are stale" — and it is *easier* to make this mistake
than the ordinary staleness bug, because reading the SDK's own git source
feels like reading ground truth. It is not, unless you also check that what
you read has actually shipped.

**Concretely**: before trusting anything about a SDK's current shape,
confirm the specific fact you're relying on against the published artifact
(`npm view @suqo/sdk version` + inspect the real tarball, or
`repo.packagist.org/p2/<package>.json` + the exact commit its `dist` field
points to) — not against a git clone's default branch, and not against a
changelog section that hasn't been given a release date/tag yet.

## Step-by-step procedure

1. **Determine the currently-pinned version** for each SDK from this repo's
   own pointer file, `.sync/sdk-versions.json` (see below).

2. **Determine the actual latest published version** — `npm view @suqo/sdk
   version` for TS, the Packagist API (`repo.packagist.org/p2/suqo/sdk-php.json`,
   take the highest non-dev `version`) for PHP. If it matches the pinned
   version, there is nothing to do — stop here, do not open an empty PR.

3. **Tier 1 — verify the templates against the real, published new version**
   (see per-language playbook below for the exact commands). Install that
   exact version (not `main`, not `latest` if `latest` could resolve to a
   pre-release), and compile/analyze `templates/*`.
   - Pass: no evidence of drift in the templates specifically. Still
     continue to step 4 — Tier 1 passing does not mean Tier 2 is unnecessary.
   - Fail: real, confirmed drift. Note exactly what failed for the PR/issue
     in step 5 — do not silently patch the template yourself without also
     understanding *why* it broke, since the same underlying SDK change
     likely affects prose too.

4. **Tier 2 — check whether prose needs updating.** Pull every changelog
   entry between the old pinned version and the new one (the real, tagged
   version sections — e.g. everything between a `## [X.Y.Z] - ` line and the
   next `## [` line — never the perpetually-evolving `[Unreleased]` header
   unless that section has actually been released under the version you're
   syncing to). Cross-reference each entry against `SKILL.md`/`references/*.md`
   for the affected skill. For each entry that's user-visible and
   documented-or-should-be-documented here, draft the prose update — using
   the SDK's own `docs/*.md` (which maps close to 1:1 onto this repo's
   `references/*.md`) as source material, not raw source code or your own
   invented explanation.

5. **Open a draft PR** with the same two-banner convention `.sync/PROCEDURE.md`
   already established (reuse it, don't reinvent it):
   - Real prose/template changes: `> 🔁 **Content update.** ...`
   - Checked, nothing relevant needed updating: `> 🔹 **Checked, no relevant
     changes found.** ...`
   State plainly: which SDK, old version → new version, which changelog
   entries were reviewed, what Tier 1 found, and what (if anything) Tier 2
   changed. If Tier 1 failed and you couldn't determine the right prose fix,
   say so explicitly rather than guessing — mark the PR draft and describe
   the exact failure, same as `.sync/PROCEDURE.md`'s own guardrail.

6. **Update `.sync/sdk-versions.json`** to the new version, in the same
   commit as everything else — this is what step 1 reads next time, so
   skipping it means the next run redoes this same diff from scratch.

## Per-language playbook

### TypeScript (`@suqo/sdk`, documents `skills/ts-sdk-usage`)

```bash
npm view @suqo/sdk version                     # the real latest published version - the only trustworthy source
mkdir -p <scratch-dir> && cd <scratch-dir>
npm init -y
npm install @suqo/sdk@<exact-version> typescript @types/node
cp <this-repo>/skills/ts-sdk-usage/templates/*.ts .
```

Then typecheck — but a loose `tsc --noEmit` against unannotated code proves
little, confirmed directly: a template that never explicitly types a field
will happily accept either the old or new shape of that field, since
TypeScript just infers whatever the installed package says. **Write an
explicit structural check** for the specific type(s) a changelog entry says
changed, using two-way assignability (a genuine equality check, not one-
directional compatibility):

```ts
import type { Customer } from "@suqo/sdk";
interface DocumentedCustomer { /* ...exactly what SKILL.md/references currently claim... */ }
const _a: DocumentedCustomer = {} as Customer;
const _b: Customer = {} as DocumentedCustomer;
```

If this fails to compile, the documented shape and the real shape have
actually diverged — that's Tier 1's real signal, not just "did the existing
templates still compile."

### PHP (`suqo/sdk-php`, documents `skills/php-sdk-usage`)

```bash
curl -s https://repo.packagist.org/p2/suqo/sdk-php.json   # dist.reference is the exact commit Packagist serves - use that, not main
mkdir -p <scratch-dir> && cd <scratch-dir>
composer require suqo/sdk-php:<exact-version>
cp <this-repo>/skills/php-sdk-usage/templates/*.php .
```

Then analyze with `phpstan` (matching `suqo-sdk-php`'s own `ci` script,
which already runs `stan` as a release gate) against the templates, plus
the same explicit structural-equality technique as TS where a changelog
entry claims a specific type changed — PHP has no built-in structural
equality check the way TypeScript's assignability does, so for a claimed
property/type change, explicitly read the real class's constructor
signature (`vendor/suqo/sdk-php/src/Model/<X>.php`) directly and diff it
against what's documented, rather than relying on `phpstan` alone to catch
every possible drift.

## Guardrails

- Never check a SDK's git `main` branch or an unreleased `CHANGELOG.md`
  entry as if it were current fact — always the actual published package.
  This is the guardrail that already failed once; see above.
- Never treat a Tier 1 pass as proof Tier 2 needs no changes — some type
  changes (e.g. a field becoming nullable) pass every compiler check while
  still making prose wrong.
- Never write a template-verification check that only tests unannotated,
  loosely-inferred code — it proves nothing about a claimed type change.
  Use an explicit structural-equality check for TS; read the real PHP class
  source directly for PHP.
- Tier 2 output is always a draft PR. Never auto-merge prose changes — there
  is no mechanical proof they're correct, unlike Tier 1.
- If a changelog entry's real-world impact is unclear, say so in the PR
  rather than guessing at a rewrite.

## `.sync/sdk-versions.json`

The pointer file both this procedure and any future drift-check read/write —
mirrors `.source-sync`'s role in the downstream sync:

```json
{
  "ts-sdk-usage": { "package": "@suqo/sdk", "version": "1.0.0" },
  "php-sdk-usage": { "package": "suqo/sdk-php", "version": "1.0.0" }
}
```
