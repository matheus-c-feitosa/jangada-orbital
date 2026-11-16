# Demo video script

30-second project demo for the NASA Space Apps Challenge 2026 submission ("Link to Project Demo" field).
Length: **28.0 s** (2 s of margin under the 30 s limit). Narration in Portuguese by a team member, burned-in English
subtitles. The final cut (2026-11-15) follows the script below; see "How the final cut was made".

Sources read on 2026-11-14:
[Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) (section "Tips for
Creating a Project Demo") and
[Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/).

Deadlines: script final by Sunday Nov 15, 12:00. App live by Saturday Nov 14, 23:00 (recording uses the real app).
Submission closes Sunday Nov 15, 23:59 Fortaleza time.

## Fill in before recording

| Placeholder | What goes there |
|---|---|
| `[MEMBER NAMES]` | Names of all team members, as on the team page (on-screen text only, not spoken) |
| `[APP URL]` | Public address of the deployed app |
| `[DEMO AREA]` | The area drawn in shot 4, chosen in rehearsal (see "What to record") |

The project name is **Jangada Orbital: Harmonized Fire Calendar** (team name: Jangada Orbital). It must match the "Project Name" field on the
project page.

## Script

The five blocks follow the outline in the official guide (0:00 / 0:02 / 0:05 / 0:10 / 0:20–0:30).
Subtitle budget: at most 2.5 English words per second.

| # | Time | On screen | Narration (Portuguese) | Subtitle (English) | Words / max |
|---|---|---|---|---|---|
| 1 | 0:00–0:03 | Title card: the Jangada Orbital mark, "Jangada Orbital", "Harmonized Fire Calendar", member names, "Fortaleza, Brazil · NASA Space Apps Challenge 2026" | Somos a Jangada Orbital, de Fortaleza. | We are Jangada Orbital, from Fortaleza. | 6 / 7.5 |
| 2 | 0:03–0:07 | Text card: "Challenge · Harmonization of MODIS and VIIRS Hot Spots"; a MODIS bar (since 2000, 1 km) and a bar six times longer for VIIRS (since 2012, 375 m, "≈ 6× more hotspots over Brazil") | Dois satélites contam o fogo no Brasil. E discordam. | Two sensors count Brazil's fires. They disagree. | 7 / 10 |
| 3 | 0:07–0:12 | Live app, Brazil: slow zoom from the map to the fire calendar. Label: "Live app · Brazil, 2001 to today" | Nós harmonizamos os dois num só calendário de queimadas, desde 2000. | We harmonized them into one fire calendar, since 2000. | 9 / 12.5 |
| 4 | 0:12–0:17 | Live app: the state of Pará, then an area drawn on the map (Jalapão, Tocantins) with its own calendar | Escolha um estado, bioma, município, ou desenhe sua área. | Pick a state, biome, municipality, or draw your area. | 9 / 12.5 |
| 5 | 0:17–0:22.5 | Live app, Pará: the Season tab (start, peak and end of each fire season), then "2026 so far" against the normal range with the "This year vs normal" map | Veja quando a temporada de fogo chega, e se este ano está fora do normal. | See when the fire season comes, and if this year is unusual. | 12 / 13.75 |
| 6 | 0:22.5–0:26 | Method page: the validation chart and table (test years 2021–2022) | Validado em anos que o modelo nunca viu. | Validated on years the model never saw. | 7 / 8.75 |
| 7 | 0:26–0:28 | End card: the mark, "Jangada Orbital", the app URL, "Data: NASA FIRMS (MODIS + VIIRS), IBGE · Open source, Apache-2.0", "NASA Space Apps Challenge 2026 · Fortaleza" | Primeiro o Brasil, depois o mundo. | First Brazil, then the world. | 5 / 5 |

Totals: 55 subtitle words in 28 s (2.0 words/s). Narration: 64 Portuguese words (2.3 words/s), a normal speaking pace.
Hard cut at 0:28.0, after a 0.4 s fade to the background colour.

Shot 2 covers both guide questions: the challenge name is on screen, and "Brazil's fires" is the reason we chose it.
If the narrator runs long, cut words from shot 5 first, never from shots 1–3.

### Subtitle file (`.srt`)

```srt
1
00:00:00,000 --> 00:00:03,000
We are Jangada Orbital, from Fortaleza.

2
00:00:03,000 --> 00:00:07,000
Two sensors count Brazil's fires. They disagree.

3
00:00:07,000 --> 00:00:12,000
We harmonized them into one fire calendar, since 2000.

4
00:00:12,000 --> 00:00:17,000
Pick a state, biome, municipality, or draw your area.

5
00:00:17,000 --> 00:00:22,500
See when the fire season comes, and if this year is unusual.

6
00:00:22,500 --> 00:00:26,000
Validated on years the model never saw.

7
00:00:26,000 --> 00:00:28,000
First Brazil, then the world.
```

The same file is `docs/demo/demo.srt`, for YouTube's English captions. If the narration is re-timed, both are updated
from the cue list the render used.

## How the final cut was made

Instead of a screen recording edited by hand, the final cut is rendered by code, with the same method as our internal
explainer video (inspired by [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)): every frame is a function of
time, drawn with Skia (`@napi-rs/canvas`) and encoded with ffmpeg (libx264, 1080p, 30 fps).

- App footage: screenshots of the deployed app at 1920×1080, English UI, dark theme, taken with Playwright from shareable
  view links (`?a=uf:PA`, `?a=p:…` for the drawn area, `#method`). Each one is shown with a slow pan and zoom. They are
  the real app on 2026-11-15, data through 14 Nov 2026; nothing on them was edited.
- Title, challenge and end cards: drawn by the same script with the team's mark, the app's colours, Michroma and
  Archivo (SIL Open Font License) and IBM Plex Mono (SIL OFL). No NASA logo or insignia.
- Subtitles: burned in by the render, white Archivo at 54 px (5% of the frame height) on a dark box, at most two lines.
- SI: the render script was written with Claude Code, so a small label in the lower-right corner reads
  "Edited with SI-assisted code · app footage is the live app" for the whole video. The narration is a human voice.
- Audio: the narration is cleaned (high-pass at 80 Hz, light denoise), normalized to −16 LUFS and padded to 28.0 s.
  No music.

## Tagline options

| | Tagline | Why |
|---|---|---|
| A (used above) | **Two sensors, one fire record.** | Says the harmonization in five words. Strongest for Relevance |
| B | Every fire season, on one calendar. | Describes what the user sees. Strongest for Presentation |
| C | Fire since 2000, on one timeline. | Stresses the long record. Use only if the app shows data back to 2000 on recording day |

All three fit the 5-second slot in shot 3 without changing the timing.

## How each line serves the judging criteria

| Criterion | Where the video answers it |
|---|---|
| Impact | Shot 5: anyone can tell normal burning from a warning sign; Brazil first, then the world |
| Creativity | Shot 3 and 4b: a calendar of burning as the way to read hotspots recorded since 2000 |
| Validity | Shots 4a–4c: the real, working app, recorded live, with a comparison against the historical median |
| Relevance | Shots 2 and 4b: the challenge is named, and NASA FIRMS MODIS + VIIRS data is the core of every screen |
| Presentation | The official five-step outline, one idea per shot, readable subtitles, 28 s |

## What to record in the app

Record each step as its own take, at least three times, and keep the cleanest one. Only these five things are shown;
the script uses no other feature.

| Take | Screen | Clicks | Used in |
|---|---|---|---|
| R1 | Opening screen, map of Brazil, nothing selected | None. Hold still for 6 s | Shot 3 |
| R2 | Map | Draw `[DEMO AREA]` in one steady motion (about 2 s) | Shot 4a |
| R3 | Fire calendar for the area | None. Hold 6 s, then move the cursor slowly over the months that burned most | Shot 4b |
| R4 | Current month against the historical median | None. Hold 4 s | Shot 4c |
| R5 | CSV download | One click on the download control; keep recording until the browser shows the file | Shot 4c |
| R6 | Calendar and map together, or scroll back to the map | None. Hold 8 s (background for shot 5) | Shot 5 |

Before recording:

- Choose `[DEMO AREA]` in rehearsal: an area where the calendar shows a clear dry-season pattern and the current month
  has a visible difference from the median. Write down the area so every take uses the same one.
- Load the area once before recording, so the takes do not show loading time.
- Browser in full screen (F11), zoom at 125%, no bookmarks bar, no extensions, no personal tabs or notifications.
- Window at 1920×1080. Larger cursor (Windows Settings → Accessibility → Mouse pointer).
- Nothing on screen may show a person's face, a personal account or an email address.

## Recording and subtitling at no cost (manual alternative)

This was the plan before the code-rendered cut above. It stays as the fallback if the video has to be remade by hand.

| Step | Tool (free) | Notes |
|---|---|---|
| Screen capture | [OBS Studio](https://obsproject.com) | 1920×1080, 30 fps, MP4 or MKV. No watermark |
| Voice | Phone voice recorder or any headset, in a quiet room | Record the whole narration in one take with a stopwatch; it must fit in 28 s. The narrator must be 18 or older |
| Title, text and end cards | Made in the editor: white text on a dark background | No AI images, so no watermark is needed. No NASA logo, "meatball", "worm", flag or mission patch |
| Editing | [Shotcut](https://shotcut.org) or [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) (free version) | Both export without a watermark. Clipchamp, included in Windows 11, also works at 1080p |
| Subtitles | Burned into the picture in the editor, from the `.srt` above | Burned-in subtitles cannot be switched off by the viewer. Also upload the `.srt` to YouTube as English captions |
| Music | None, or a CC0 track | Any track used must be listed in the project page's references field |
| Hosting | YouTube, visibility "Unlisted" | Set "No, it's not made for kids" and no age restriction. Unlisted links open without login |

Subtitle style: white sans-serif text with a dark outline or box, at least 5% of the frame height, at most two lines,
in the lower part of the frame, never over the app's own labels.

With ffmpeg, burn the subtitles in and check the length:

```bash
ffmpeg -i demo_edit.mp4 -vf "subtitles=demo.srt:force_style='FontSize=22,Outline=2'" -c:a copy -t 28 demo_final.mp4
```

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 demo_final.mp4
```

## Validation against the rules

| Rule (source) | How this script meets it | Still to verify after editing |
|---|---|---|
| Video of 30 seconds or less; longer demos are not eligible for Global Judging (Submission Guide) | Timeline ends at 0:28.0 | `ffprobe` on the final file and the length YouTube shows must both be ≤ 0:30 |
| Another language may be spoken only with English subtitles (Submission Guide, Judging Guide) | Every spoken line has an English subtitle; all on-screen text is in English | Subtitles are burned in and readable on a phone |
| Public link, no password, permission or registration (Submission Guide) | YouTube, unlisted | Open the link in a private window, signed out, on a second device |
| No images, video, audio or other likeness of anyone under 18 (Submission Guide, Terms & Conditions) | Screen recording and text cards only; no faces. One adult narrator | Confirm the narrator's age; no photos added in editing |
| SI-generated images and videos carry a visible watermark (Submission Guide) | No SI-generated image or video is planned | If any is added, it carries a visible "SI-generated" watermark for its whole time on screen |
| SI-generated audio is acknowledged in text and metadata (Submission Guide) | Human narration | If a synthetic voice is used, say so in the YouTube description and in `docs/SI_USAGE.md` |
| Generated content may not use NASA logos, flags or mission identifiers (Submission Guide) | "NASA FIRMS" appears as plain text only, as a data credit | Check every card and the YouTube thumbnail |
| No copyrighted material without permission; all resources listed in references (Judging Guide) | No music by default; cards made by the team | Any music or font added is listed on the project page |
| Demo shows the final project, including the software created (Submission Guide) | 10 of 28 seconds are the real app in use | Recording comes from the deployed app at `[APP URL]`, not a mockup |

### Compliance checklist

Decided by the script:

- [x] Planned length 28 s, under the 30 s limit
- [x] Follows the official outline: who we are, challenge, name and tagline, how it works, future
- [x] English subtitle for every spoken line, at most 2.5 words per second
- [x] All on-screen text in English
- [x] Names NASA FIRMS, MODIS and VIIRS as the data behind the app
- [x] Shows only what the app does: draw an area, fire calendar, current month against the median, CSV download
- [x] No people on camera, no SI-generated images, no NASA logo

To tick on the final file, before pasting the link into the project page:

- [ ] Placeholders filled: member names, app URL, demo area
- [ ] "Project Name" on the project page reads "Jangada Orbital: Harmonized Fire Calendar", as in the video
- [ ] Final file is 30 s or less (`ffprobe`), and YouTube shows 0:30 or less
- [ ] English subtitles are burned in and readable at phone size
- [ ] Link opens in a private window with no login, on a device that never opened it
- [ ] YouTube: unlisted, not made for kids, no age restriction
- [ ] Nobody under 18 is seen or heard
- [ ] Any SI-generated image or video has a visible "SI-generated" watermark; any SI audio is acknowledged in the description
- [ ] No NASA logo, flag or mission insignia anywhere, including the thumbnail
- [ ] Music and fonts, if any, are free to use and listed in the references field
- [ ] `docs/SI_USAGE.md` records any SI tool used for the video
- [ ] Link pasted in "Link to Project Demo" and "Submit for Judging" clicked before Sunday Nov 15, 23:59
