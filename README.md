# AI Market Atlas

Bilingual (EN / 繁中) AI market intelligence site. One structured snapshot drives every number — equities, compute, energy, models, and power semiconductors.

**Phase 1**: Homepage deployed.  
**Phase 2**: Full content pages, archives, HyperFrames brief, automated review, Wed/Sat cron.

## Quick start

```bash
python3 -m http.server 8877
# Open http://localhost:8877
```

## Design

- Palette: `#07121D` (midnight navy), `#0C1B29` (panel), `#73E1E6` (cyan), `#FF8A5C` (orange), `#F4EFE4` (ivory)
- Typography: Geist (editorial), Geist Mono (data/sources)
- All numbers from `market-snapshot.json`

## Deployment

Cloudflare Pages — `ai-market-atlas.pages.dev`
