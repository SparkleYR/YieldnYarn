# Local demonstration

Follow the root [README](../../README.md) for a portable Docker or source setup.
The Windows helper scripts reuse the prepared runtime under `.demo/` and are intended for the local presentation computer.

```powershell
.\start-demo.ps1 -SkipSeed -SkipPhone
.\stop-demo.ps1
```

The startup helper requires the prepared Python environment and web dependencies. It starts PostgreSQL through WSL, applies migrations, and launches the three application services. Run without `-SkipSeed` only when you intend to populate demonstration records. Use `-DevWeb` for the development web server. Review the script parameters before using phone setup or seeding options.

The prepared seed uses `Demo@12345` for local demonstration accounts. These accounts belong only in a disposable development database. Create your own accounts for a fresh installation.

- [Website walkthrough](website-walkthrough.md)
- [Faculty review walkthrough](faculty-review.md)
- [Recorded image analysis](image-results.md)

Use separate browser profiles for buyer and staff sessions. Accepting an offer or matching a requirement changes inventory; inspect the starting quantity before repeating a workflow.
