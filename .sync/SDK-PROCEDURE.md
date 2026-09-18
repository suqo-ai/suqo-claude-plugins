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

2. **Determine the actual latest published version.**
   - TS: `npm view @suqo/sdk version`.
   - PHP: `curl -s https://repo.packagist.org/p2/suqo/sdk-php.json` — its
     `packages["suqo/sdk-php"]` array is **not guaranteed to be in descending
     order** (confirmed: nothing in Packagist's p2 spec promises this, it
     just happens to be true today). Parse every entry's `version` field
     (note: **v-prefixed**, e.g. `"v1.0.0"`, not the bare
     `version_normalized`), discard anything that isn't a stable release,
     and semver-compare all of them yourself — don't just take the first
     array entry. Use the `dist.reference` commit SHA of whichever version
     you land on, and pass the same `v`-prefixed string to `composer
     require suqo/sdk-php:<version>` (that's the form Composer/Packagist
     both expect).

   If either matches its pinned version already, there is nothing to do for
   that SDK — stop here, do not open an empty PR.

3. **Tier 1 — verify the templates against the real, published new version,
   as a diff against a baseline** (see per-language playbook below for the
   exact commands). Don't just run the check once against the new version
   and expect zero errors — the templates have real third-party
   dependencies (Express/Fastify/vitest for TS; Symfony/PSR/Laravel classes
   for PHP) that a plain scratch install won't have, so a from-scratch run
   is noisy with errors that have nothing to do with SDK drift. Instead:
   1. Run the exact same check against the **old pinned version** first —
      this is your noise baseline (missing-peer-dependency errors, and any
      other pre-existing noise, will appear here too).
   2. Run it again against the **new published version**.
   3. **Diff the two error sets. Only errors present in the new run but
      absent from the baseline are real signal.** Anything present in both
      is pre-existing noise, not something this sync run caused or should
      fix.
   - New errors found: real, confirmed drift. Note exactly what's new for
     the PR/issue in step 5 — do not silently patch the template yourself
     without also understanding *why* it broke, since the same underlying
     SDK change likely affects prose too.
   - No new errors: no *template-level* evidence of drift. Still continue
     to step 4 — this does not mean Tier 2 is unnecessary (see the
     Guardrails section on exactly what kinds of real changes a clean Tier
     1 diff can still miss).

4. **Tier 2 — check whether prose needs updating.** First, **confirm this
   SDK's `CHANGELOG.md` actually uses the same heading format you're about
   to parse** — don't assume PHP's looks like TS's just because it's also
   "Keep a Changelog"-flavored; check the last few version headers match
   `## [X.Y.Z] - <date>` before relying on that boundary to extract entries.
   If it doesn't, say so and figure out the real boundary rather than
   silently mis-extracting entries.

   Then pull every changelog entry between the old pinned version and the
   new one (the real, tagged version sections only — never the
   perpetually-evolving `[Unreleased]` header unless that section has
   actually been released under the version you're syncing to).
   Cross-reference each entry against `SKILL.md`/`references/*.md` for the
   affected skill. For each entry that's user-visible and
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

# Templates import real peer packages beyond the SDK itself - confirmed by
# grepping every templates/*.ts import. Install all of them, and give
# tsconfig a "types" field, or you'll drown in Cannot-find-module/Cannot-
# find-name errors that have nothing to do with SDK drift (reproduced
# directly: 25+ such errors on a from-scratch install with none of this).
mkdir -p <scratch-dir> && cd <scratch-dir>
npm init -y
npm install typescript @types/node express fastify vitest
cat > tsconfig.json <<'JSON'
{ "compilerOptions": { "target": "ES2020", "module": "NodeNext",
  "moduleResolution": "NodeNext", "strict": true, "esModuleInterop": true,
  "skipLibCheck": true, "noEmit": true, "types": ["node"] },
  "include": ["*.ts"] }
JSON
cp <this-repo>/skills/ts-sdk-usage/templates/*.ts .

# Baseline against the OLD pinned version first (per step 3) - this is what
# lets you skip perfectly matching every peer-dependency version: whatever
# noise remains after installing the above is identical in both runs, so it
# cancels out in the diff instead of needing to be eliminated up front.
npm install @suqo/sdk@<old-pinned-version>
npx tsc --noEmit -p tsconfig.json > /tmp/baseline.txt 2>&1

npm install @suqo/sdk@<new-published-version>
npx tsc --noEmit -p tsconfig.json > /tmp/new.txt 2>&1

diff /tmp/baseline.txt /tmp/new.txt   # only lines unique to new.txt are real signal
```

For a changelog entry that claims a **specific** type/method changed,
supplement the diff above with a direct structural check — but know its
real limitations, confirmed by testing both directly, not assumed:

```ts
import type { Customer } from "@suqo/sdk";
interface DocumentedCustomer { /* ...exactly what SKILL.md/references currently claim... */ }
const _a: DocumentedCustomer = {} as Customer;
const _b: Customer = {} as DocumentedCustomer;
```

- **This does not catch a newly added *optional* property.** Two-way
  assignability passes cleanly even when the real type gained an optional
  field the documented type lacks — confirmed: `{ id: string; name: string
  }` vs `{ id: string; name: string; address?: string }` compiles clean
  both directions. For "was a field added," diff the actual key lists
  (e.g. read the installed `.d.ts` directly), don't rely on this check.
- **This does not catch a parameter-shape change on a method declared with
  method-shorthand syntax** (`foo(x: T): U`, not `foo: (x: T) => U`) —
  confirmed: TypeScript checks method parameters *bivariantly*, so this
  check passes even when a method's parameter type has genuinely changed.
  The real SDK declares its resource methods this exact way (confirmed:
  `ProductsResource.list(params?: PageParams): Promise<Page<Product>>` is
  method-shorthand). For a changelog entry describing a method signature
  change, read the installed package's real `.d.ts` directly for that
  method and compare it by eye — don't trust this check for methods.

### PHP (`suqo/sdk-php`, documents `skills/php-sdk-usage`)

```bash
curl -s https://repo.packagist.org/p2/suqo/sdk-php.json   # see step 2 for version-selection details - don't just take the first array entry

mkdir -p <scratch-dir> && cd <scratch-dir>
composer init --no-interaction --name=sync/scratch
composer require --dev phpstan/phpstan   # NOT installed by requiring the SDK - it's a require-dev of the SDK's OWN repo, not of this scratch project
mkdir examples && cp <this-repo>/skills/php-sdk-usage/templates/*.php examples/
# Templates under examples/ so `require __DIR__ . '/../vendor/autoload.php'`
# (3 of them use this exact path) resolves correctly - copying them flat
# into the same directory as vendor/ breaks that path (confirmed directly).

# Baseline against the OLD pinned version first, same reasoning as TS:
# templates import real Symfony/PSR/Laravel classes this scratch project
# never installs, and diffing against a same-noise baseline means you don't
# have to perfectly replicate every framework dependency to get a real signal.
composer require suqo/sdk-php:<old-pinned-version>
vendor/bin/phpstan analyse examples --level=0 --no-progress > /tmp/baseline.txt 2>&1

composer require suqo/sdk-php:<new-published-version>
vendor/bin/phpstan analyse examples --level=0 --no-progress > /tmp/new.txt 2>&1

diff /tmp/baseline.txt /tmp/new.txt   # only lines unique to new.txt are real signal
```

PHP has no structural-assignability trick the way TypeScript does. For a
changelog entry that claims a specific property/type/method-signature
changed, skip trying to construct an equivalent clever check — **read the
real class source directly** (`vendor/suqo/sdk-php/src/Model/<X>.php` or
`src/Resource/<X>.php`) and compare it by eye against what's documented.

## Guardrails

- Never check a SDK's git `main` branch or an unreleased `CHANGELOG.md`
  entry as if it were current fact — always the actual published package.
  This is the guardrail that already failed once; see above.
- Never treat a Tier 1 pass as proof Tier 2 needs no changes — some type
  changes (e.g. a field becoming nullable) pass every compiler check while
  still making prose wrong.
- Never run Tier 1's check once, from scratch, and expect zero errors —
  the templates have real peer/framework dependencies a plain install
  won't have. Always diff against a same-noise baseline run on the *old*
  pinned version (see the per-language playbooks); a raw error count with
  no baseline is not a real signal.
- Never trust the TypeScript two-way-assignability trick for a method's
  parameter shape (bivariance defeats it, confirmed, and the real SDK
  declares methods this exact way), or for detecting a newly added
  *optional* property (also confirmed to pass silently). Read the real
  installed `.d.ts`/class source directly for those cases instead.
- Never assume one SDK's `CHANGELOG.md` heading format without checking —
  confirm it before parsing, per step 4.
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
