# YouTube Download for Raycast

Download YouTube subtitles in **RAW TXT**, **clean TXT**, **SRT**, or **VTT**. Browse creator-provided and YouTube-generated tracks by language. When a video has no caption tracks, download its audio and transcribe it locally with **whisper.cpp `ggml-large-v3-turbo.bin`**. The same command can save the video's audio as MP3 or M4A, or save an MP4 video.

This extension uses a native Raycast list and actions. It does not call DownSub or send audio to a transcription service.

## Install locally

Requirements: Raycast, macOS, Node.js, `yt-dlp`, and `ffmpeg`. Install the latter two with Homebrew:

```sh
brew install yt-dlp ffmpeg
```

Then clone this repository and run:

```sh
npm install
npm run dev
```

Open **YouTube Download** under Raycast's Development section. The search bar is the link field. If your clipboard already holds a YouTube watch, short, live, embed, or `youtu.be` link, the command puts it in the search bar and searches right away. Pasting a YouTube link with ⌘V also searches right away, replacing the current video. Typed links and links to other sites supported by `yt-dlp` show **Search This Link**; press Return to search them. The results appear at once with the video's thumbnail and title in a side panel, so you can confirm it is the right video while the caption list loads. The channel, duration, upload date, and details of the selected row are listed below the title. Type text that is not a link, such as `serbian` or `mp3`, to filter the results. Esc clears the search bar, and a second Esc closes the command. Use the format selector above the language list, then press Return on a language to save it. RAW is the default: it saves caption text in its original cue order, including repeated rolling cues, as a file ending `- RAW.txt`. Clean TXT removes repeated rolling text. SRT and VTT keep timestamps. To download the same video's media, choose MP3, M4A, or MP4 in the **Audio & Video** section. Files are saved to `~/Downloads` by default; you can choose another folder in extension preferences. Existing files are given a numeric suffix.

Choose **Edit Favorite Languages** from any row's actions (⌘K) and enter a comma-separated text value such as `Serbian, English, sr`. The extension remembers the saved value; extension preferences provide its initial default. Matching ignores capitalization and `(orig)` / `-orig`, so `Serbian`, `serbian`, and `serbian (orig)` find the same language. Matching tracks appear first. If there is no direct match, close fuzzy matches appear in **Suggested Languages**.

## Enable local Whisper transcription

Whisper is only offered if the inspected video has no creator or automatic captions. Build `whisper.cpp` on each machine and download the required model:

```sh
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release
sh ./models/download-ggml-model.sh large-v3-turbo
```

In Raycast extension preferences, set:

- **whisper.cpp CLI** to the absolute path of `build/bin/whisper-cli`.
- **Large V3 Turbo Model** to the absolute path of `models/ggml-large-v3-turbo.bin`.
- **Transcription Language** to `Serbian`, `auto`, or another language supported by whisper.cpp. The default is `Serbian`.

If your checkout is at `~/GitHub/whisper.cpp` with the CLI and model in the paths above, the extension finds them automatically. The preferences let other machines use their own installation paths.

The extension downloads audio to a temporary directory, converts it with `ffmpeg` to mono 16 kHz WAV, then runs the configured CLI with that exact model. It saves SRT, VTT, and TXT files together in the download folder. Temporary audio is removed after the job finishes. MP3 and M4A downloads are separate actions if you want to keep the audio.

Each machine needs its own `yt-dlp`, `ffmpeg`, whisper.cpp CLI, and model. The 1.5 GB model is deliberately not included in the extension package. `yt-dlp` and `ffmpeg` are found from `PATH` or common Homebrew locations, or can be selected explicitly in preferences.

## Build and publish

```sh
npm run build
npm run lint
npm run publish
```

Raycast's publishing command opens a contribution pull request in the Raycast extensions repository. The `author` field in `package.json` must match the publisher's Raycast Store handle. The current value is `davidrosic`; change it if your Raycast username differs. The repository includes `package-lock.json` and a 512×512 icon for review.

## Notes

- The extension handles a **single YouTube video** per invocation. Playlist parameters are ignored.
- Available languages depend on tracks returned by YouTube through `yt-dlp`. YouTube-generated and translated caption tracks may be numerous. This extension does not create new translations.
- If YouTube rate limits an automatic caption, the extension retries once after a 60-second subtitle delay. YouTube may still refuse some translated tracks.
- RAW and clean TXT are both readable `.txt` files. RAW keeps all caption cues, while clean TXT removes adjacent and rolling repetitions. SRT prefers a native SRT track and removes empty cues; VTT preserves timed captions.
- Audio and video actions choose the best quality available for their selected format. MP3 uses the highest quality audio conversion setting.
- A private, unavailable, or restricted video may require authentication or may be blocked by YouTube. Update `yt-dlp` when YouTube changes its extraction behavior.
