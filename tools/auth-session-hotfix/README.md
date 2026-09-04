# Production unsigned-session authentication hotfix

This one-time repair starts from production release 392's immutable image digest.
It removes only the known `session:` verifier exception and runs authentication
regression tests inside the resulting image. It does not ship the developer's
uncommitted gameplay changes or modify the persistent volume's contents.

The fetched main branch already uses signed Firebase token verification. The
vulnerable production exception was not committed there. The regression test
also runs against main, without `--warfront` (that route is not on main yet):

```powershell
node tools/auth-session-hotfix/regression.mjs server/authoritative-v3/fly-data-api.mjs
```

Deploy from this directory using `flyctl deploy --config fly.toml --remote-only`.
This is an explicitly production-scoped configuration, not the isolated beta
configuration; beta isolation checks remain unchanged. Before deployment, verify
the live image is the pinned base and that the app, volume, services, process,
and environment match this config, except for the `-authfix1` build ID suffix.
If production has moved on, do not redeploy this historical image.

After deployment, check health and verify that a fabricated session token returns
401 from both GET and POST `/api/warfront/state`. Use an empty POST body so the
verification cannot submit valid campaign state even if authentication regresses.
Do not restore the vulnerable base image as a rollback.
