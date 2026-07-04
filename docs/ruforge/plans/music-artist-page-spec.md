# RuForge music artist page + stats/recap spec

**Status:** spec / ready to build (sequenced behind the listen-event log)  
**Scope:** `MusicArtistView` (Spotify-shaped artist page) + Wrapped-style recap in `MusicStatsView`.  
**Identity lock:** ZERO-CONFIG. No API keys, ever. No settings wall. RuForge builds for general consumers, not tech-savvy users. A “paste your API key” field is a wall most users bounce off. Anything requiring user setup is out.

**Related docs:**

- `user-profiling.md` (when present) — consumes aggregated genres from this work
- Supersedes any earlier `artist-hero-enrichment.md` draft
- Profile chip → profile entry: all chips call `openProfilePage()` → music mode + `MusicStatsView` (not Explorer)

---

## Source stack (locked: Option A)

All free, zero-config, no token, local-first clean:

1. **MusicBrainz** (already integrated; 1 req/sec global mutex already built)
   - Identity: artist MBID, name, type (Person/Group), disambiguation
   - Discography: release-groups (note 25-per-response limit, browse for more)
   - Genre chips: **aggregated from release-groups**, not the sparse artist-level field
2. **Wikidata** (free, no token; reached via MB artist url-rels → Wikidata QID)
   - Descriptor role line (“RAPPER”): occupation field
   - Origin (“Chicago, US”): place-of-origin / place-of-birth (P19) + country
3. **Wikipedia extract** (free, no token; via the Wikidata sitelink)
   - About / bio text

**Rejected and why:**

| Source | Reason |
|--------|--------|
| Discogs | `/database/search` requires embedded auth secret; cannot ship in OSS repo |
| Last.fm | API key required; embedding pins all users to one rate limit + exposes key in-repo; user-supplied key is a config wall |
| Spotify | Proprietary + OAuth + not local-first; source of monthly listeners and global stream counts |

---

## The render law

This is what the old creator view got wrong:

1. **Present-only.** Every field renders only when its data exists. No field → no element. No empty chip row, no “Unknown” descriptor, no orphan MapPin with no city. Absence is silent, never a placeholder that reads as broken.
2. **No reserved slots** for data the stack cannot get. There is **no** UI element, ever, for: monthly listeners, global per-track stream counts, global-streams “Popular” ranking. These are Spotify-proprietary. A slot for them stays empty forever = looks broken.
3. **Honest labels** on every number. Where a count is real it is **local** truth, labeled as such: “in your library”, “your plays”, “most played in your library”. Never imply a global metric RuForge does not have.
4. **Thin looks intentional.** The page must look like a finished, clean, minimal page with **any** subset of enrichment present (genres only / origin only / nothing but name + local stats). The always-present local stats carry the page when enrichment is empty. Test the thin case explicitly, not just the King Von full case.

---

## Artist page layout (Spotify-shaped, honest sources)

| Section | Source | Notes |
|---------|--------|-------|
| Hero name + cover mosaic | Local covers | Already shipped |
| Role line (uppercase subtitle) | Wikidata occupation; else MB type normalized; else MB disambiguation; else **omit** | **Not** city+occupation. Role only. |
| Local stats (N songs / N albums / runtime) | Local files | Always present, carries the page |
| Genre chips (cap **4**) | MB release-aggregated | See aggregation |
| Origin (“Chicago, US”) | Wikidata P19/area + country, own MapPin line | **Separate** from role line |
| Play / Shuffle | Local | Already shipped |
| Albums grid | Local owned + MB discography | Local cards first; MB-only releases get no “owned” badge |
| Songs list | Local | Rows show **your** play count from profiler, labeled |
| About (bio + image) | Wikipedia extract + local artist art | Present-only; collapses if no extract |
| Discography (full) | MB release-groups | Owned badge on library matches |

### Descriptor format (decided)

Role line and origin are **two separate elements**. Do **not** assemble `"CHICAGO RAPPER"` from city + occupation: it duplicates the origin line and breaks for Group / multi-role artists. Uppercase role subtitle (occupation/type) + separate MapPin origin line. Spotify feel (role + place) without a fragile string template.

### Genre aggregation (fix for “thin for most artists”)

MB artist-level genre tags are sparse (community-vote dependent). Data lives on release-groups + recordings, which are densely tagged.

1. Fetch the artist’s release-groups (extend existing MB calls).
2. Collect genre/tag entries + vote counts across all of them.
3. Tally vote counts per normalized genre name (case-fold; `hip hop` == `Hip-Hop`).
4. Rank, take top **5** in Rust, render top **4** in UI (align `take(4)` in `musicmeta.rs` with `MusicArtistView` ~522).

Same genres feed the profiler — one fix, two systems. Write to sidecar in profiler-readable form.

---

## Fetch strategy: lazy + sidecar cache (decided)

**Lazy on artist-page open**, not background batch. MB 1 req/sec makes full-library batch queue for minutes.

On artist open:

1. Read disk cache (`musicmeta/artists/{normalized}.artistmeta.json`). Present + fresh → render, no network.
2. Miss → fetch MB (aggregate genres + discography) + resolve Wikidata (role + origin) + Wikipedia extract (bio), write sidecar, render.
3. Dedupe in-flight by artist key (extend existing `artistInfoInFlight` pattern in `MusicArtistView`).

**Cache:** Extend existing artist-meta sidecar (`ensure_artist_meta_sidecar`). Add: aggregated genres, Wikidata role + origin, Wikipedia bio extract, MB discography. Bump `schemaVersion`.

**Batch enrichment:** Phase 2 optional “enrich library” pass (same shape as `MusicMetaBackfillModal`). Not default, not v1.

---

## v1 cuts (explicit)

- **Fans also like:** CUT (Last.fm was the good source; MB relations too weak for v1)
- **Global “Popular” by stream count:** CUT; optional **“Most played in your library”** only if enough play history, else omit
- **Monthly listeners / global stream counts:** never a UI slot
- **Any API key UI:** never

---

## Stats / Wrapped recap (`MusicStatsView`)

**Current:** All-time + last 7 days (`SEVEN_DAYS_MS`). No Wrapped yet.

### Timing windows

| Window | Role |
|--------|------|
| All-time + this week | Always-on live stats (shipped) |
| Calendar year | Headline Wrapped — one hero story per year (“Your 2025 in RuForge”) |
| Data-gated lighter recap | Snack before year-end; keeps recap alive when the year card would be empty |

### Layered model (year + snack)

- **Headline:** Calendar-year Wrapped (recognizable consumer shape). Fires at year-end **only** if enough events in that year (data floor, e.g. 50+ plays). Never fires empty.
- **Snack:** Lighter rolling recap (default **monthly**; optional rolling-30) gated on data sufficiency so users get payoff before December.
- **Character:** Lighter recap = compact card, single accent, quick read. Year Wrapped = multi-slide ceremony. Seasonal palette theming = **post-ship polish**, not v1.

### Trigger model

- **Manual:** Stats page always reachable (profile chip → `openMusicStats`; secondary Library entry OK).
- **Milestone toast:** Dismissable on threshold crossings (plays, minutes, distinct artists, top-artist change).
- **Period recap:** Data-gated only. No data → no prompt.

### Placement

Not Home primary focus. Stats is a destination behind the music profile chip.

---

## Build order (gated by listen-event log)

**Prereq:** Persistent listen-event log (shared with stats + profiler). Minimum fields: track key, canonical artist/album/title, genre, timestamp, ms-listened, completed, source.

### Artist page (unblocked except MB/Wikidata work; does not need log for enrichment UI)

1. Genre aggregation off release-groups in `get_artist_info` / `musicmeta.rs`; align `take(4)`.
2. Wikidata: MB url-rels → QID → occupation + origin.
3. Wikipedia extract via Wikidata sitelink.
4. Extend artist-meta sidecar schema; bump `schemaVersion`.
5. `MusicArtistView`: role + origin, present-only gating, About, discography + owned badge, honest local play counts.
6. Verify **thin** case (no MB tags / no Wikidata).

### Stats / recap (blocks on log)

7. Milestone detection + dismissable toast.  
8. Data-gated lighter recap.  
9. Calendar-year Wrapped with data floor.  
10. Profile chip → `openMusicStats` (shipped with chip avatar fix).

---

## Open questions (non-blocking)

| Topic | Default |
|-------|---------|
| Lighter recap cadence | Monthly (calendar-aligned with year headline) |
| Seasonal palette on year Wrapped | Deferred polish, post-ship |
