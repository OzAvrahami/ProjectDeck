# Release process

ProjectDeck uses SemVer with a leading `v` on Git tags and GitHub Releases. Package metadata describes the candidate version; only a **published GitHub Release** establishes an authoritative released version. A tag alone does not. Release, Deployment and runtime Health remain independent.

## Normal development

- Accumulate meaningful user or maintainer changes under `[Unreleased]` in `CHANGELOG.md`.
- Completing an implementation Issue does not automatically bump the package version.
- Before a release, reconcile Unreleased with Git history and completed Issues; include meaningful work without Issues and exclude unfinished capabilities.
- Keep historical version references and regression fixtures intact.

## Release boundary

1. Verify the repository, clean working tree, branch, local/remote main, previous tag and existing GitHub Releases. Audit every commit in `<previous-tag>..HEAD`, including migrations, configuration, credentials and operational changes.
2. Choose SemVer intentionally. ProjectDeck is pre-1.0; substantial capability additions justify a minor version, while focused fixes normally justify a patch.
3. Move Unreleased entries into a dated version section and leave Unreleased empty for future work. During preparation, that dated entry is a candidate, not proof of publication. Recheck its date if publication occurs later; compare links for the new tag become usable after the tag is pushed.
4. Update package and lockfile metadata with `npm version X.Y.Z --no-git-tag-version --ignore-scripts`. Verify only root version metadata changed and no additional authoritative application-version source needs updating.
5. Prepare concise GitHub Release notes from the complete range. Include upgrade requirements and relevant provider limits; do not claim unfinished Issues or browser validation that was not performed.
6. Run `npm test`, `npm run lint`, `npm run build` and `git diff --check`. Verify version agreement, migration snapshots/schema consistency, secret/config boundaries, and absence of the proposed tag/Release. Validate authenticated rendering when behavior changed. Do not apply production migrations as a side effect of preparation.
7. Leave the preparation Issue **Open / Verify** for user review. The user manually stages and commits the reviewed candidate, then pushes main. Re-run final checks on that commit and verify local main, origin/main and remote main agree with a clean working tree.
8. The user manually creates and pushes `vX.Y.Z` on the verified release commit. Follow the existing annotated-tag convention (`v0.1.0` is annotated). Verify the tag's peeled commit locally and remotely; do not move an existing published tag.
9. After explicit publication authorization, publish a GitHub Release for **exactly the verified existing tag** and reviewed notes. Do not silently let publication create a tag at another commit. Re-read its tag, URL, draft/prerelease state and publication time.
10. Verify ProjectDeck observes the published Release in Portfolio, Workspace Releases and global Releases, with the correct GitHub destination and scope. Deployment/Health must not substitute for this check. Then complete the release Issue.

## Git authority

Codex must not stage, commit, push or tag unless the user explicitly changes that rule. Release preparation does not authorize creating a tag or publishing a GitHub Release. Git operations belong to the user by default.

## Upgrading from v0.1.0 to v0.2.0

The release contains three additional committed database migrations, in order:

| Migration | Purpose |
| --- | --- |
| `0002_clean_viper.sql` | Nullable Project Phase override and its enum |
| `0003_small_scream.sql` | Resource monitors, scope references and indexes |
| `0004_square_magik.sql` | Provider connections, encrypted credential envelopes and resource associations |

Existing v0.1.0 databases need any unapplied migrations before the new application serves traffic. Fresh installations need the complete migration chain, including 0000 and 0001. Review the database target and backup/recovery plan before a separately authorized `npm run db:migrate`; preparation does not establish which migrations a production database has already applied. The legacy lifecycle field remains for compatibility.

Review `.env.example` for the server-only GitHub Projects token, optional separate Standard Apply write tokens, Railway OAuth settings and dedicated provider-credential encryption key, and optional Vercel/PostgreSQL monitor credentials. Keep the encryption key stable for existing encrypted provider connections. Never place credentials in `NEXT_PUBLIC_*`, monitor metadata, release notes or repository files. The private access gate already existed at v0.1.0 and remains required; `/api/health` is a public liveness response, not a database/provider readiness check.

The included Railway connection/discovery/mapping functionality does not imply completion of broader Railway work (#12). Vercel supports the legacy configured latest-production-attempt monitor; installation/discovery and independent serving-deployment observation (#13) remain unfinished. GitHub Standard cannot automatically configure Issue Forms, native workflow rules or Project views; it exposes manual/unsupported steps. Release/deployment drift (#22) and bounded latest-Release lookup (#28) are separate future work.
