# Migrations

Every config or breaking API change gets a migration guide here.

| File | Applies to | Summary |
|------|-----------|---------|
| *(none yet)* | v0.x → v0.x | — |

Conventions:

- Each file named `v<from>-to-v<to>.md`.
- Walk through: old shape → new shape → auto-migration (if any) → manual
  steps → rollback.
- Include a working `paygate config migrate` command.
