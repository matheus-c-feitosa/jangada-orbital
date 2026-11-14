# Demo video script

30-second project demo for the NASA Space Apps Challenge 2026 submission ("Link to Project Demo" field).
Target length: **28.0 s** (2 s of margin under the 30 s limit). Narration in Portuguese, burned-in English subtitles.

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
| 1 | 0:00–0:02 | Title card on a plain dark background: "Jangada Orbital", `[MEMBER NAMES]`, "Fortaleza, Brazil" | Somos a equipe Jangada Orbital. | We are team Jangada Orbital. | 5 / 5 |
| 2 | 0:02–0:05 | Text card: "MODIS · since 2000" and "VIIRS · since 2012 · ~6× more hotspots". Below: "Challenge: Harmonization of MODIS and VIIRS Hot Spots" | Dois sensores contam o fogo no Brasil e discordam. | Two sensors count Brazil's fires. They disagree. | 7 / 7.5 |
| 3 | 0:05–0:10 | The app's opening screen with the map of Brazil. Overlay text: "Jangada Orbital: harmonized fire calendar" and the tagline | Jangada Orbital: um calendário de queimadas harmonizado. Dois sensores, um só registro do fogo. | Jangada Orbital: a harmonized fire calendar. Two sensors, one fire record. | 11 / 12.5 |
| 4a | 0:10–0:12.5 | Screen recording: the cursor draws `[DEMO AREA]` on the map | Desenhe qualquer área do Brasil. | Draw any area in Brazil. | 5 / 6.25 |
| 4b | 0:12.5–0:16.5 | The fire calendar (months × years) appears for that area. Slow zoom on the months that burned most. Small caption: "Data: NASA FIRMS (MODIS + VIIRS)" | Dados do NASA FIRMS mostram os meses e anos que mais queimaram. | NASA FIRMS data shows which months and years burned most. | 10 / 10 |
| 4c | 0:16.5–0:20 | The current month compared with the historical median, then a click on the CSV download | Este mês está fora do normal? Baixe o CSV. | Is this month unusual? Download the CSV. | 7 / 8.75 |
| 5 | 0:20–0:28 | 0:20–0:26: the calendar stays on screen, slow zoom out to the full map. 0:26–0:28: end card with "Jangada Orbital", `[APP URL]`, "Data: NASA FIRMS", "NASA Space Apps Challenge 2026 · Fortaleza" (text only) | Com um registro único, qualquer pessoa separa a queimada normal do sinal de alerta. Primeiro o Brasil, depois o mundo. | With one consistent record, anyone can tell normal burning from a warning sign. First Brazil, then the world. | 18 / 20 |

Totals: 63 subtitle words in 28 s (2.3 words/s). Narration: 74 Portuguese words (2.6 words/s), a normal speaking pace.
Hard cut at 0:28.0. Nothing after the end card.

Shot 2 covers both guide questions in three seconds: the challenge name is on screen, and "Brazil's fires" is the reason
we chose it. If the narrator runs long, cut words from shot 5 first, never from shots 1–3.

### Subtitle file (`.srt`)

```srt
1
00:00:00,000 --> 00:00:02,000
We are team Jangada Orbital.

2
00:00:02,000 --> 00:00:05,000
Two sensors count Brazil's fires.
They disagree.

3
00:00:05,000 --> 00:00:10,000
Jangada Orbital: a harmonized fire calendar.
Two sensors, one fire record.

4
00:00:10,000 --> 00:00:12,500
Draw any area in Brazil.

5
00:00:12,500 --> 00:00:16,500
NASA FIRMS data shows which months
and years burned most.

6
00:00:16,500 --> 00:00:20,000
Is this month unusual?
Download the CSV.

7
00:00:20,000 --> 00:00:24,000
With one consistent record, anyone can tell
normal burning from a warning sign.

8
00:00:24,000 --> 00:00:28,000
First Brazil, then the world.
```

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

## Recording and subtitling at no cost

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
