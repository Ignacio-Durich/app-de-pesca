# SDD ledger — plan: docs/superpowers/plans/2026-10-29-app-de-pesca-fase-1.md
Spec: docs/superpowers/specs/2026-10-29-app-de-pesca-design.md (binding)
Branch: fase-1 (base main af4d148)

## Preflight scan
| Rows | Produces → consumes | Finding |
|---|---|---|
| T2→T3,T4,T5,T12 | parseLocal/formatLocal/localToUtcDate, findExtremes, tidePhaseAt | consistent |
| T3→T5,T9,T12 | Forecast{lat,lon,utcOffsetSeconds,hours[{wind:{ecmwf,gfs,icon}…}],days} | consistent; scoreDay gets lat/lon from forecast |
| T4→T5 | moonDay(date,lat,lon,offset) | consistent |
| T5→T9 | scoreDay/findWindows/median | consistent |
| T6→T7,T8 | makeClient(tripId) | consistent |
| T7→T8,T10,T12,T13,T14 | localGet/Set, saveRow/listRows/pull/enqueue/pending | consistent |
| T8→T10,T11,T13 | TripShell | T10/T11/T13 modify TripShell but don't list it in Files — see R4 |
| T9→T13 | getForecast | consistent |
| T11→T14 | distanceBearing | consistent |
| T12→T14 | conditionsAt | consistent |
| T13→T14 | basemapLayer, Cache 'depth-v1', tilesInRadius | consistent |
| T1 self | step 1 git init | repo already initialised by controller — R1 |
| T2 self | test asserts high/low/high/low order from tide-forecast | order is an assumption; fixture decides — R6 |
| T5 self | spec says score per hour; plan uses 30-min slots | R3 |
| T5 self | noGo wind measure unspecified | R5 |
| T6,T1,T9,T13,T16 self | external: wrangler deploy, Supabase project, R2 upload, real phones | R2 |
| T9/T12 vs spec §2.2 | chart must show catch marks; T9 precedes catches | R7 |
| T14 vs spec §2.3 | spot edit + numbered soundings not in plan steps | R8 |
| T10 vs spec §5 | refresh on app return (visibilitychange) not in plan | R9 |
| Other tasks self | tests vs code vs files | agree |

## Rulings
- Ruling R1: T1 skips git init (done by controller on branch fase-1) — avoid double init — cost if wrong: none.
- Ruling R2: Steps needing the user's accounts or devices (wrangler login/deploy, Supabase project + apply migration + Storage e2e, pmtiles extract + R2 upload, phone checks, T16) are deferred to a user checklist; implementers deliver code + local tests + `npm run build`. — external side effects need the user — cost if wrong: deploy-only bugs (SPA fallback, CORS, RLS) surface later.
- Ruling R3: 30-min slots as in plan — spec §4 "ventanas recortadas a la media hora" is satisfied naturally — cost if wrong: minor UI granularity.
- Ruling R4: T10/T11/T13 may modify TripShell.jsx (pending counter, emergency route, reminder banner/prepare button) — spec requires those UI hooks — cost: none.
- Ruling R5: noGo uses the same effective wind as windFactor (median of max(mean, 0.7·gust)) — consistent with spec §4 wind definition — cost if wrong: noGo slightly stricter.
- Ruling R6: T2 test asserts extremes within 20 min of 00:42/07:05/13:09/19:09; high/low types asserted from what the fixture shows (alternating) — spec §6 only fixes times — cost: none.
- Ruling R7: T12 adds catch marks to ScoreChart — spec §2.2 — cost: none.
- Ruling R8: T14 includes edit of spot fields (name, species, best_tide, depth, notes) and numbered sounding markers — spec §2.3 — cost: small extra UI.
- Ruling R9: T10 adds pull on app open and on visibilitychange→visible — spec §5 concurrency — cost: none.

## Progress
Task 1: dispatched (base af4d148)
Task 1: minor (deferred): src/app.jsx:114 decodeURIComponent throws on malformed /t/ path
Task 1: minor (deferred): .gitignore lacks .env (and dev-dist/)
Task 1: minor (deferred): router untested; deps are preact 11 / vite 8 / vitest 5 / vite-plugin-pwa 2
Task 1: complete (commits af4d148..66eebb2, review clean)
Task 2: dispatched (base 66eebb2)
Task 2: minor (deferred): tides.js:23 extreme next to an interior null is dropped; tidePhaseAt then pairs same-type extremes (suggest null when prev.type===next.type)
Task 2: minor (deferred): no test with null beside an extreme; no assertion on refined h; wide plateaus not centred
Task 2: complete (commits 66eebb2..56fafcb, review clean)
Task 3: dispatched (base 56fafcb)
Task 3: minor (deferred): union test doesn't cover marine-only timestamps; non-wind metrics only shape-checked; findLast sets Safari 15.4 floor
Task 3: complete (commits 56fafcb..ff40914, review clean)
Task 4: dispatched (base ff40914)
Task 4: minor (deferred): formatLocal truncates seconds; transit presence test loose; alwaysUp/alwaysDown not exposed
Task 4: complete (commits ff40914..80d82b8, review clean)
- Ruling R10 (T5): slot :30 values = linear interpolation of neighbour hours per model; factors that are null (tide, wind, weather) drop out and the remaining weights renormalize — spec silent, plan Review Focus 2 — cost if wrong: score slightly different on data gaps.
- Ruling R11 (T5): window score = max slot score; window edges are slot boundaries (no extra trimming to tide extremes; 30-min slots already give half-hour edges) — spec §4 "recortan a la media hora" — cost if wrong: edges off by ≤30 min.
- Ruling R12 (T5): weak day = the contiguous run of eligible slots at the day's max score — spec "la mejor del día" — cost: none.
- Ruling R13 (T5): costa tide precedence: ±1 h of low (0.2) > last 2 h of rising / 1 h after high (1.0) > 1–2 h after high (0.5) > rest of rising (0.7) > falling (0.25) — spec lists overlapping bands — cost if wrong: band edges.
Task 5: dispatched (base 80d82b8)
- User decision (29/10): Forecast screen = style A (hero 'Anzuelos al agua HH:MM', hasta, countdown, puntaje/viento/por qué, siguiente ventana, ahora) + collapsible 'Ver hora por hora' with style B tide curve (windows green over curve, night grey, score bars, catch marks). Spec §2.2 updated. Carry into T9 dispatch.
- Ruling R14 (T5): noGo slots are not eligible for windows — spec §2.2 "No conviene salir" contradicts recommending that hour — cost if wrong: none.
- Ruling R15 (T5): circular mean for :30 wind direction instead of linear (implementer deviation accepted) — linear breaks at 0/360 — cost: none.
- Note for user: with spec §4 weights the whole rising tide scores ≥7 → 7/11 costa window 08:00–14:30 (6.5 h). Spec-conformant; flag as tuning item.
Task 5: minor (deferred, FIX BEFORE MERGE): score.js:104 float rounding turns exact x.5 into x (can cross WINDOW_MIN) — add epsilon or integer weights
Task 5: minor (deferred, FIX BEFORE MERGE): windows.js:14,17 window starting ≤60 min after a high labelled "bajante" instead of repunte
Task 5: minor (deferred, FIX BEFORE MERGE): windKmh is effective wind (gust-inflated) but reason/hero label it "viento" — show median mean wind in text
Task 5: minor (deferred): config constants reused for reason text; no guard when sunrise/sunset missing (night silently false)
Task 5: complete (commits 80d82b8..22e435a, review clean, 1 controller-ruled fix)
Task 6: dispatched (base 22e435a)
Task 6: minor (deferred): no explicit grant execute on req_trip to anon; rls.sql lacks upsert/trips_upd asserts; revoke not applied to authenticated; storage block in rls.sql depends on internals
Task 6: complete (commits 22e435a..d87df4b, review clean; SQL NOT applied — no Supabase project yet, user deciding: free limit of 2 active projects reached)
Task 7: dispatched (base d87df4b)
- Ruling R16 (T7): ops carry tripId (scope for trip tables / row.trip_id, trip id itself for trips, null for spots/soundings); flush(getClient) and startAutoFlush(getClient) resolve getClient(op.tripId) per op — spec §2.1 several trips per phone + RLS by header — cost if wrong: interface change for T8+ (they haven't started).
Task 7: minor (deferred, FIX BEFORE MERGE): throwing onQueueChange callback rejects enqueue after save → duplicate op on UI retry
Task 7: minor (deferred): silent catch in flush/startAutoFlush (store lastError); duplicate-photo=success needs unique paths; rowKey undefined; per-tab lock
Task 7: fix round 1/5 (2 addressed, 0 open — pull/flush race; per-trip clients R16; commits 1c17fb1..11340cb)
Task 7: minor (deferred): residual narrow pull race (enqueue after 'before' read + full flush inside select window)
Task 7: complete (commits d87df4b..11340cb, review clean after 1 fix round)
- Ruling R17 (T8): createTrip is offline-first (saveRow('trips', id, row) → queue), place via lat/lon inputs + "usar mi ubicación" (map picker needs Leaflet from T13); TripShell tabs follow the mockup the user liked: Pronóstico, Mapa, Capturas, Más (Checklist, Itinerario, Especies) + SOS button; app wires startAutoFlush(makeClient) — cost if wrong: minor UI rework.
Task 8: dispatched (base 11340cb)
- E2E (controller, 29/10): Supabase project app-de-pesca (secondary account) migrated by user; app created real trip San Blas 00000000-0000-4000-8000-000000000000 via UI → queue → Supabase; REST: header=own id sees it, no/other/garbage header sees []; storage-e2e: own folder OK, other folder rejected by RLS. Test file to delete by hand: catch-photos/109a85b8-e2de-4d3c-9a33-4d94163aa2f9/test.jpg
Task 8: minor (deferred, FIX BEFORE MERGE): queue waits up to 60 s after a write before uploading — call flush right after saveRow when online
Task 8: minor (deferred, FIX BEFORE MERGE): first-open pull can hang forever on weak signal (add ~10 s timeout → offlineFirstOpen)
Task 8: minor (deferred, FIX BEFORE MERGE): SOS white on #ef5350 ~3.5:1 contrast; .shell .page bottom padding ignores safe-area inset
Task 8: minor (deferred): members null-safety; malformed URL decode; unknown tab highlight; share no feedback; geoloc error not cleared; chip aria-label/case dup; refresh promise no catch; member input not cleared after Agregar
Task 8: complete (commits 11340cb..5e1dbf8, review clean)
Task 9: dispatched (base 5e1dbf8)
Task 9: minor (deferred, FIX BEFORE MERGE): pull replaces local rows with server result even when server returns [] → a local-only row with no pending op (or an RLS/header bug) wipes local data; consider never deleting local rows absent from server for trips
Task 9: minor (deferred, FIX BEFORE MERGE): hero headlines a window that already passed today — promote next not-ended window
Task 9: minor (deferred, FIX BEFORE MERGE): no fetch timeout (AbortSignal.timeout) → long "Descargando…" on weak signal
Task 9: minor (deferred, FIX BEFORE MERGE): forecast refresh only on mount — also on visibilitychange/tick when age > 1 h
Task 9: minor (deferred, FIX BEFORE MERGE): score chip always green (weak day) + low contrast white on --good dark
Task 9: minor (deferred): '?' uncertainty from effective wind vs raw table values; ScoreChart empty levels guard
Task 9: complete (commits 5e1dbf8..db3f5c9, review clean; controller browser check OK on live data)
- Ruling R18 (T10): T10 also triggers flush right after a local write when navigator.onLine (via a small helper in queue/repo), so shared edits upload immediately — needed for T10's own two-phone check; resolves the T8 FIX-BEFORE-MERGE item — cost: none.
Task 10: dispatched (base db3f5c9)
Task 10: minor (deferred): flushClient not cleared on startAutoFlush cleanup; bare navigator in requestFlush; Itinerary crashes on null starts_at (external rows); inputs cleared before saveRow resolves; R18 slightly widens residual pull race (see T7)
Task 10: complete (commits db3f5c9..2142ff4, review clean; controller browser check: checklist item reached Supabase in <3 s, itinerary renders with default 7/11 08:00)
Task 11: dispatched (base 2142ff4)
- Ruling R19 (T12): species.json is produced by T15; T12 creates src/data/species.json as [] and the species field is free text with a <datalist> fed from species.json names (empty until T15) — plan order T12 before T15 + no invented species — cost: none.
Task 11: minor (deferred): no timestamp on last fix in 'waiting'; no component test for GPS states (no DOM test env)
Task 11: fix round 1/5 (1 Important + 1 minor addressed, 0 open — GPS status messages; commit 8d9961d)
Task 11: minor (deferred): "ya no se actualiza" note wording also used for 'waiting' (recoverable) — soften
Task 11: complete (commits 2142ff4..8d9961d, review clean after 1 fix round; controller browser check OK)
Task 12: dispatched (base 8d9961d)
Task 12: implementer DONE_WITH_CONCERNS (commit 8a270c7); review NOT yet dispatched — moved to cloud session 29/10. Concerns: deleting a catch leaves photo in bucket; offline photo not shown until uploaded; edited time skips GPS; wind uses nearest hour (tide height interpolated); pending panel label lacks species. Controller browser check + airplane-mode check pending.
