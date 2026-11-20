# Repository automation

## Desktop builds
`.github/workflows/desktop-client.yml` builds the Windows x64 installer and Linux x64 AppImage/DEB packages when desktop files change. Artifacts are retained by GitHub Actions for 14 days. They are not automatically published as a release.

## Secret hygiene
`.github/workflows/secret-hygiene.yml` runs Gitleaks on pushes and pull requests targeting `main` or `Server`. A detected credential fails the workflow.

A scan does not move credentials or erase Git history. If a credential has ever been committed:
1. Revoke/rotate it at the provider immediately.
2. Store its replacement in the private runtime environment or the appropriate GitHub Actions secret/environment.
3. Remove the value from tracked files and replace it with an environment-variable reference or safe example.
4. If history cleanup is needed, coordinate a repository-wide history rewrite; do not force-push it automatically from CI.

Production runtime secrets belong in the host's protected environment file outside the checkout. CI-only secrets belong in GitHub Actions Secrets or protected Environments. Never copy live credentials into a public workflow artifact or public repository.

## Wiki synchronization
`.github/workflows/wiki-sync.yml` publishes Markdown files from `docs/*.md` as Wiki pages when those files change on `main` or `Server`.

Create a repository Actions secret named `WIKI_TOKEN` with permission to write to this repository's Wiki. The workflow will not run successfully until that secret is configured and the Wiki is enabled. The Wiki is a generated mirror; `docs/` remains canonical.
