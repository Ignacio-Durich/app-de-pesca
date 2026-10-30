# Task 12: Capturas: report

**Status:** DONE_WITH_CONCERNS (concerns are small; see the end)
**Commit:** `8a270c7 feat: catches with auto conditions and offline photos` (branch fase-1, parent 8d9961d)

## What was built
- `src/catches/conditions.js`: `conditionsAt(forecast, extremes, tLocal)` returns `{tide_phase, tide_height_m, wind_kmh, wind_dir_deg}`.
  - Tide height is interpolated linearly between the two neighbouring hours. It is null if either hour is missing.
  - Wind is the `median` of the models' raw `wind` values (no gust inflation). Direction is the `circularMean` of the models' `dir` values. Both come from the **nearest hour**: the ruling says "hourly values" and only asks for interpolation on the tide.
  - Tide phase is `pleamar`/`bajamar` when an extreme is within `SLACK_MIN = 30 // [diseño]`. Otherwise it is `creciente`/`bajante` from `tidePhaseAt`, or null.
  - Anything the forecast doesn't cover returns null. It never throws.
- `src/catches/photo.js`: `resizePhoto(blob, maxSide = MAX_SIDE, quality = QUALITY)` uses createImageBitmap and canvas to make a JPEG. 1600 and 0.8 are marked `[diseño]` (spec §5). It runs only in the browser and has no unit test.
- `src/data/species.json` = `[]` (R19). It feeds the `<datalist>` names. No species names were added.
- `src/screens/Catches.jsx` (wired as `capturas` in `tabs.jsx`):
  - **Form fields:** species (free text plus a datalist, required), length in cm (optional), who (select, defaults to `me`), "Devuelta al agua", photo (optional), and date and time (default now, in trip-local time from `fromInstant`).
  - **On save:**
    - `caught_at = toInstant(date, time)` (−03:00).
    - Conditions come from `cachedForecast(trip)` at save time, so this works offline. With no cached forecast, all conditions are null.
    - GPS uses `getCurrentPosition` with `GPS_TIMEOUT_MS = 8000` and `GPS_MAX_AGE_MS = 60000`, both `[diseño]`. It always resolves: on denial, error or timeout the catch is saved without lat/lon.
    - The photo is resized and saved through `saveRow('catches', tripId, row, {path, blob})` with path `<tripId>/<catchId>.jpg`. The queue uploads it to `catch-photos` before the row.
  - **Decision (mine):** if the user edits the date or time, GPS is skipped, because the current position isn't where an earlier catch happened. A short note under the inputs says so. If the time is left untouched, "now" is taken again at save time.
  - **Photo errors:** if the photo can't be processed, the screen shows an error and saves nothing. This avoids silently losing the photo; the user can retry without it.
  - **List:** newest first. Each catch shows a thumbnail, species, cm, who, day and time, "devuelta", and the conditions line (phase, tide in m, wind in km/h plus cardinal direction). There is a Borrar button.
    - Thumbnails are 56px and come from `makeClient(tripId).storage.from('catch-photos').getPublicUrl(path)`. If the image fails to load (offline), it is hidden. Tapping it opens the full photo in a new tab.
  - **Ranking:** per member, the count and the biggest length_cm, sorted by count and then by length.
  - **Summary:** count per tide phase, plus "sin dato" when it is above 0.
- **Chart marks (R7):** `Forecast` reads the catches with `useRows('catches', tripId)` and converts `caught_at` to trip-local time with `fromInstant`. It passes the shown day's times to `ScoreChart` as `catches`. The chart draws an amber dot (`.sc-catch`) in the gap between the tide curve and the bars, with the tooltip `<title>Captura HH:MM</title>`.

## TDD
RED: `npx vitest run test/conditions.test.js`
```
FAIL  test/conditions.test.js
Error: Cannot find module '../src/catches/conditions.js' imported from .../test/conditions.test.js
Test Files  1 failed (1)
```
GREEN, same command after the implementation:
```
Test Files  1 passed (1)
     Tests  6 passed (6)
```
The tests use the 7/11 fixtures through `normalize`:
- 10:00 is creciente, with the hourly tide height, the median wind of the models and the circular-mean direction.
- At 10:15 and 10:30 the tide height is a linear interpolation.
- ±10 min from the high gives pleamar, and +10 min from the low gives bajamar.
- High + 2 h gives bajante.
- A time outside the forecast gives all nulls.
- A missing neighbouring sea value gives a null height while the other values are kept.

## Full verification
- `npx vitest run`: 16 files, **132 passed**.
- `npm run build`: OK (PWA, 9 precache entries).
- In the browser preview, the Capturas tab renders the form correctly. I did **not** save a catch there: the auto-mode classifier blocked the click because it would write to the shared Supabase.

## Files
- New: `src/catches/conditions.js`, `src/catches/photo.js`, `src/screens/Catches.jsx`, `src/data/species.json`, `test/conditions.test.js`
- Modified: `src/screens/tabs.jsx`, `src/screens/Forecast.jsx`, `src/components/ScoreChart.jsx`, `src/styles.css` (2 rules)

## Self-review
- No invented real-world values. The new constants are 30 min, 8 s and 60 s (`[diseño]`) and 1600/0.8 (the spec's `[diseño]`).
- Local-first is kept: the screen renders from `useRows`, and conditions use only the cached forecast.
- `conditionsAt` assumes the forecast's local time is the trip's −03:00 (the same assumption as `toInstant`/`fromInstant`, which hold for Argentina).
- `Placeholder` is still used by mapa and especies.

## Concerns
1. **Step 4 skipped:** the manual airplane-mode check is left for the controller, as instructed. The real save path (IDB + queue + photo upload) was not exercised in a browser.
2. **Orphaned photos:** deleting a catch removes the row through `deleteRow`, but the photo stays in `catch-photos`. The queue has no storage-delete op. Add one if storage cleanup matters.
3. **No thumbnail before upload:** a photo saved offline doesn't show in the list until it is uploaded and the device is online, because the page reads the public URL and not the queued blob. This matches the ruling.
4. **Pending panel label:** `TripShell`'s pending panel shows catch ops as "Captura: guardar" without the species name, because `describe` doesn't read `species`. I left it alone since it is outside this task's files; it is a one-token fix.
5. `Catches.jsx` is about 200 lines, which is reasonable for a form, list, ranking and summary.
