# Newton M3 7.5" Tag – Step‑by‑Step Connection Guide

Follow these steps to bring a Newton M3 7.5" (800×480, 4‑color BWRY) tag online and see it in the new Tags page.

## 1. Prerequisites

- A running OpenEPaperLink AP (ESP32) flashed and reachable via the dev web UI
- Newton M3 7.5" hardware powered (fresh batteries or bench supply)
- Optional: USB‑serial log access to AP for debugging

## 2. Confirm AP Firmware Supports Newton Tags

The AP should already include generic tag database handling. If you recently updated, perform a quick refresh:

1. Open the dev UI home page.
2. Make sure system status shows "online".
3. If you rebuilt firmware: power‑cycle or reset the AP and wait until online.

## 3. Open the Tags Page (dev UI)

1. Navigate to `dev/tags.html` (or use navigation link if present).
2. The page auto‑loads the tag database via `/get_db`.
3. Initially you may see "Loading tag database…" then an empty table if no tags have checked in yet.

## 4. Put the Newton Tag Into Pairing / Check‑In Cycle

Typical Newton / SoluM M3 tags will periodically wake and attempt to find the AP. If the tag is new or reset:

1. Insert batteries (or power it) – watch for initial splash / boot screen.
2. If there is a wake / scan / button, press it once to force a network scan.
3. Keep the tag within RF range of the AP (same channel / environment) until it appears.

## 5. Detecting First Appearance

When the tag first checks in:

- A new row appears in the table (auto‑refresh every 20s by default; click Refresh to force immediate update).
- It will be heuristically recognized by: resolution 800×480 + 4 colors or name fragments.
- A greenish NEWTON badge will show in the Type column (e.g. "Newton M3 7.5" (4C)").

If it does not appear after a few wake cycles:

- Click Refresh.
- Reduce Auto setting to 10s or trigger a manual wake on the tag again.
- Inspect AP serial logs for join / handshake messages.

## 6. Understanding Table Columns

- MAC: Unique tag identifier.
- Alias: Editable label (future enhancement; presently read‑only placeholder).
- Type: Display size & color depth; NEWTON badge indicates recognition.
- Resolution: Derived (800x480 for this model).
- Colors: Reported color channels (should be 4 for BWRY).
- Battery: Approximate voltage if reported (converted to volts).
- RSSI: Last received signal strength (dBm) if available.
- Last Seen: Relative time since last contact.
- Actions: Temporary Ping button (fetches recent info via `/get_db?mac=` for debugging).

## 7. Improving Recognition (Optional)

If your Newton does not get the NEWTON badge but is 800×480/4C:

- Ensure the tag sends color count meta (4). If firmware reports differently, update detection rule in `dev/tags.js` inside `isNewton()`.
- Add an alias containing "newton" from any configuration interface (future editable alias support planned).

## 8. Forcing a Fresh Refresh Cycle

1. Set Auto to Off.
2. Click Refresh.
3. Wait for table update, then re‑enable Auto (20s or 30s) if desired.

## 9. Troubleshooting

| Symptom | Possible Cause | Action |
|---------|----------------|-------|
| Tag never appears | RF mismatch or AP not scanning | Reboot AP; verify firmware; check channel settings. |
| Battery shows blank | Tag firmware not sending voltage | Confirm tag supports battery telemetry. |
| Colors shows unexpected value | Tag not reporting color count | Manually adjust detection logic or update tag firmware. |
| NEWTON badge missing | Heuristic failed | Add alias with keyword or adjust `isNewton()` pattern. |
| Last Seen never updates | Tag asleep too long | Wake tag manually; verify it isn't in deep sleep mode. |

## 10. Next Steps / Future Enhancements

- Inline alias editing & save endpoint
- Action menu: force refresh, reboot, deep sleep commands
- Tag capability badges (NFC, Button, LED)
- Sorting & paging for large fleets
- Dedicated Newton icon & firmware status

---

If you need deeper diagnostics, open browser DevTools (Network tab) and watch successive `/get_db?pos=` calls or query an individual mac with `/get_db?mac=YOURMAC`.

## 11. Alias Editing (Now Available)

You can now rename (alias) tags directly in the dev Tags table:

1. Click the Alias cell of a tag (it highlights into an input field)
2. Type a new alias (max 63 characters)
3. Press Enter (or just blur/focus away) to save

What happens:

- The UI pauses auto refresh while you edit
- A quick POST is sent to `/tag_alias` with `mac` and `alias`
- On success the table updates immediately and auto refresh resumes
- On error the cell briefly flashes red and reverts

Notes:

- Aliases persist (saved to tag DB) immediately
- Editing does not force the tag to refresh its display; it affects management UI + future commands
- Use filter box to quickly locate by new alias

Troubleshooting alias save failures:

- Ensure AP is online
- Check that MAC stayed the same (no refresh mid‑edit)
- Inspect Network tab for `/tag_alias` response (should return `{ "success": true }`)
