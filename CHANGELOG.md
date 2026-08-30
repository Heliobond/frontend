# Changelog

All notable changes to Heliobond are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to follow [Semantic Versioning](https://semver.org/)
once it cuts its first tagged release (it currently ships continuously from
`main` at `0.1.0`, per `package.json`).

## How entries are added

- Every PR that changes user-facing behaviour (a feature, a fix, a breaking
  change) adds one line under **`[Unreleased]`**, in the category it belongs
  to — `Added`, `Changed`, `Fixed`, `Removed`, `Security` — creating the
  category heading if it doesn't exist yet. See [`CONTRIBUTING.md`](./CONTRIBUTING.md#development-workflow).
- Purely internal changes (refactors, tooling, formatting, CI, dependency
  bumps with no behaviour change) don't need an entry.
- Word each entry from the user's or contributor's point of view, past tense,
  one line, with the issue/PR number where useful — e.g.
  `- Fixed the withdraw amount rounding to two decimals (#123).`
- When a release is cut, `[Unreleased]` is renamed to the new version and
  date (`## [0.2.0] - 2026-09-01`), and a fresh empty `[Unreleased]` heading is
  added above it.
- History prior to this file's creation isn't backfilled beyond the seed
  entries below; see `git log` or the repo's GitHub releases for the full
  commit history.

## [Unreleased]

### Added

- Preemptive session timeout warning on auth forms, so in-progress form data
  isn't silently lost (#352).
- Return projection on the investment form.

### Changed

- Auth login now detects existing social accounts during email login to
  prevent duplicate accounts (#353).

### Fixed

- Investment form leading zeros, a nav prop mismatch, and decimal rounding.
- Text link and "Forgot Password" contrast on dark backgrounds (#351).
- Password reset emails now include an explicit token expiration time (#354).
- Investment hints, real-time fees, edit UX, and portfolio pending state.
- Bond filters, search, sort, and comparison.
