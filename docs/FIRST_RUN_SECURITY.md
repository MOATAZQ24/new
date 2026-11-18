# First-Run Security Architecture — Investor Gate OS

## 1. Cryptographic Secrets
- `SECRET_KEY` has no shared default fallback; `config.py` generates a 256-bit random hex key (`secrets.token_hex(32)`) if unset in non-production and aborts startup in `production` if `SECRET_KEY` is missing, shorter than 32 characters, or matches any known placeholder.
- `scripts/setup.sh` and `installer/build_release.ps1` generate unique random `SECRET_KEY`, `DB_PASSWORD`, and `APP_DB_PASSWORD` values per installation.

## 2. Single-Use Transactional First Administrator Setup (`/setup`)
- `GET /api/v1/auth/bootstrap-status` returns `{"requires_setup": true}` **only** when `users` table is empty (`0` rows).
- `/login` automatically redirects to `/setup` while `requires_setup === true`.
- `POST /api/v1/auth/bootstrap`:
  - Protected by an in-process mutex (`_BOOTSTRAP_LOCK`) and database uniqueness constraints (`IntegrityError` -> `409 Conflict`).
  - Requires explicit software license acceptance (`accept_license: true`).
  - Enforces strong passwords (`>= 12` chars with uppercase, lowercase, digit, and special character; rejects common defaults such as `Admin@12345`, `admin`, `password`, `123456`, `changeme`).
  - Hashes password using Argon2id (`hash_password`) and never logs or persists plaintext passwords.
  - Logs `BOOTSTRAP_FIRST_ADMIN` audit event without password material.
  - Permanently returns `403 Forbidden` on any subsequent call once a user exists.
