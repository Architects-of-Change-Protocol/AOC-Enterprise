# AOC Enterprise v1.0.0 — Tagging Runbook

The exact, safe sequence to go from "portability validation complete" to
a pushed `v1.0.0` tag and GitHub Release. Follow this **after** reviewing
`docs/release/AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md`'s final
recommendation — do not tag automatically as part of running the
portability drill.

Every step below is a normal, reversible-until-pushed git operation
except step 8 (pushing the tag) and step 9 (creating the Release) —
confirm the recommendation is `READY TO TAG v1.0.0` (or "...WITH
DOCUMENTED PORTABILITY LIMITATIONS") before starting, and get sign-off
per your organization's release process before step 8.

## 1. Merge the final branch

```bash
git fetch origin main
git checkout claude/aoc-v1-release-validation-5jl2ld
git status   # confirm clean; commit/push any final review feedback first
```

Merge via your normal PR process (this branch's PR into `main`). Do not
force-push `main`.

## 2. Update `main` locally

```bash
git checkout main
git pull origin main
```

Confirm the merge commit is present:

```bash
git log --oneline -1
```

## 3. Regenerate the release manifest at the final commit

The release manifest embeds the current commit hash — it must be
regenerated **after** the merge lands on `main`, not before (a manifest
generated on the feature branch would embed that branch's commit, not
`main`'s merge commit):

```bash
npm ci
npm run build
node scripts/generate-release-manifest.mjs
git diff release/RELEASE_MANIFEST.json   # review the diff
git add release/RELEASE_MANIFEST.json
git commit -m "Regenerate release manifest at v1.0.0 tag commit"
git push origin main
```

## 4. Rerun the release gate at that exact commit

```bash
npm run validate:v1-release
```

Must pass with zero failures. This includes `check:portability-smoke`
(the bounded backup/restore/compare check) and
`verify-release-manifest.mjs` (which will now confirm the manifest you
just committed matches the build).

Optionally, also rerun the full clean-room drill one final time at this
exact commit for maximum assurance before tagging:

```bash
npm run validate:portability:v1
```

## 5. Confirm no existing `v1.0.0` tag

```bash
git fetch --tags origin
git tag -l 'v1.0.0'          # must print nothing
git ls-remote --tags origin v1.0.0   # must print nothing
```

If a tag already exists and this is genuinely a re-tag situation, stop
and resolve that explicitly (do not silently overwrite a published tag)
— this is exactly the kind of destructive, hard-to-reverse action that
needs explicit confirmation, separate from this runbook.

## 6. Create an annotated tag

```bash
git tag -a v1.0.0 -m "AOC Enterprise v1.0.0 -- final release"
```

Use an **annotated** tag (`-a`), not a lightweight one — it carries a
tagger, date, and message, and is what `git verify-tag`/GitHub Releases
expect.

## 7. Verify the tag points at the correct commit

```bash
git show v1.0.0 --stat | head -5
git rev-parse v1.0.0^{commit}
git rev-parse origin/main
```

The last two commands must print the same commit hash.

## 8. Push only the tag

```bash
git push origin v1.0.0
```

**Do not** `git push --tags` (that would push every local tag, not just
this one) and do not force-push. If this fails because a remote tag
already exists, stop — see step 5.

## 9. Create the GitHub Release

Using the release manifest and this validation's final report as the
basis for the release notes:

- Title: `v1.0.0`
- Target: the `v1.0.0` tag (not a branch)
- Body: summarize from `CHANGELOG.md`'s `## [1.0.0]` section, plus a
  pointer to `docs/release/AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md` for
  the portability/backup/restore evidence and
  `docs/release/RELEASE_CANDIDATE_V1.md` for the release-candidate
  validation history.
- Attach `release/RELEASE_MANIFEST.json` and `release/api-surface.v1.json`
  as release artifacts if your process expects downloadable manifests.
- Do **not** attach a real backup, a `.env`, or any generated artifact
  containing governed data — this release documents and ships source and
  build metadata only.

## After tagging

- Confirm `git describe --tags` on a fresh clone of `main` reports
  `v1.0.0` (or `v1.0.0-N-g<hash>` if commits have landed since).
- Take a fresh backup of any long-lived environment now running this
  build (`npm run backup:v1`), per the upgrade runbook
  (`docs/operations/RUNBOOKS_V1.md` §2) — a fresh tag is exactly the kind
  of build-generation boundary that backup should bracket.
