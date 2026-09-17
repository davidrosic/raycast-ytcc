# Video Downloads & Transcription

Save YouTube subtitles in any available language as RAW text, clean text, SRT or VTT, for one video or a whole playlist or channel. Download audio or video from YouTube, Instagram, X, TikTok and [hundreds of other sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md). Transcribe or translate videos without subtitles, or any audio or video file on your Mac, with [whisper.cpp](https://github.com/ggml-org/whisper.cpp).

- **Copy a link, open the command.** A YouTube, Instagram or X link in your clipboard loads right away, with no extra steps. With no link in the clipboard, the video open in your browser loads instead.
- **See what you're downloading.** The video's thumbnail and title appear as soon as the link is recognized.
- **Every subtitle track.** Creator subtitles and YouTube's automatic captions are all listed.
- **Whole playlists and channels.** Subtitles, MP3, M4A or MP4 for every video, with videos already downloaded skipped.
- **Your languages first.** Favorite languages are listed at the top, and `serbian`, `Serbian` and `serbian (orig)` all match the same language.
- **Audio and video from most sites.** Save MP3, M4A or MP4 in the best available quality, including every video in an X post or Instagram carousel.
- **Transcribe your own files.** Select recordings or folders in Finder, pick the language, output and model, and press ⌘↵.
- **Keeps running when Raycast closes.** Audio and video downloads, playlist downloads and transcriptions run in a background queue, with progress in the menu bar and a Cancel action.
- **No invented text in silence.** Silero voice activity detection skips silence and music, which stops whisper from repeating made-up lines.
- **Local transcription.** Audio is never uploaded to a transcription service.

## Requirements

| Tool                                                           | Needed for                                        | Install                                       |
| -------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)                     | All downloads                                     | `brew install yt-dlp`                         |
| [ffmpeg](https://ffmpeg.org)                                   | MP3, M4A, MP4, subtitle conversion, transcription | `brew install ffmpeg`                         |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) + model | Transcription only                                | [Set up transcription](#set-up-transcription) |

```sh
brew install yt-dlp ffmpeg
```

The extension finds these tools in your `PATH`, `/opt/homebrew/bin`, or `/usr/local/bin`. If yours are elsewhere, set their paths in the extension preferences.

## Commands

| Command                       | What it does                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Download Video**            | Subtitles, audio and video for a YouTube video, playlist or channel, audio and video from other sites, or a pasted file path |
| **Transcribe Selected Files** | Transcribes the files or folders selected in Finder                                                                          |
| **Queue**                     | Running, queued and finished downloads and transcriptions, with Cancel and results                                           |
| **Queue in Menu Bar**         | Shows progress in the menu bar while the queue is running                                                                    |

## How to use it

1. Copy a YouTube link.
2. Open **Download Video**. The link is placed in the search bar and the video starts loading.
3. Check the thumbnail and title in the side panel.
4. Choose a subtitle format from the dropdown (⌘P). **RAW** is selected by default.
5. Select a language and press ↵.

Files are saved to `~/Downloads` unless you choose another folder in the preferences.

Already opened the command? Paste a link with ⌘V and it loads immediately, replacing the current video.

### From your browser

Watching a video in your browser? Open **Download Video** from the browser and the video in the current tab loads, with no need to copy its link. A video link in your clipboard always comes first; the browser tab is used only when the clipboard has none, and only when you open the command while a browser is the frontmost app.

This works in Safari, Chrome, Arc, Brave, Edge, Vivaldi, Opera, Dia and other Chromium browsers. The first time, macOS asks to let Raycast control the browser; the extension only reads the address of the current tab. Firefox and Zen need the [Raycast browser extension](https://www.raycast.com/browser-extension). Turn this off with **Browser Tab** in the preferences.

| Key  | Action                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| ↵    | Download the selected language in the chosen format, or the selected audio/video format                     |
| ⌘⇧C  | Download the selected language and copy its text to the clipboard                                           |
| ⌘P   | Choose the subtitle format                                                                                  |
| ⌘K   | More actions: other subtitle formats, Cancel Download, Show Queue, Edit Favorite Languages, and preferences |
| Type | Filter the list, for example `english` or `mp3`                                                             |
| ⌘V   | Paste a video link and load it, or paste a file or folder path to transcribe it                             |
| Esc  | Clear the search bar; press again to close                                                                  |

### Supported links

- **Videos:** YouTube `watch`, `youtu.be`, Shorts, Live and embed links, including `m.youtube.com` and `music.youtube.com`, with or without `https://`.
- **Playlists:** `youtube.com/playlist?list=…`. A video link that includes `&list=…` loads the video and also offers the whole playlist.
- **Channels:** `youtube.com/@name`, `/channel/…`, `/c/…` and `/user/…`, optionally with `/videos`, `/shorts` or `/streams`.
- **Other video sites:** posts, reels and videos from Instagram, X (Twitter), TikTok, Facebook, Threads, Bluesky, Reddit, Twitch, Kick, Bilibili, Vimeo, Dailymotion, SoundCloud, Bandcamp and other popular sites load as soon as you paste them, like YouTube links. Profile and home pages don't.

Links typed by hand, and links to any other site [supported by yt-dlp](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md), show **Search This Link**. Press ↵ to load them.

## Subtitles

| Format                   | File        | What you get                                                                                                                                |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **RAW · TXT (all cues)** | `- RAW.txt` | The text of every caption cue in order, without timestamps. Automatic captions repeat each line as it scrolls, and RAW keeps those repeats. |
| **Clean TXT**            | `.txt`      | Readable plain text with the scrolling repeats removed.                                                                                     |
| **SRT**                  | `.srt`      | Timed subtitles for video players and editors. Empty cues are removed and the rest renumbered.                                              |
| **VTT**                  | `.vtt`      | Timed WebVTT subtitles as YouTube provides them.                                                                                            |

Rows marked **Creator** are subtitles uploaded by the channel. Rows marked **Automatic** are YouTube's speech recognition. **(Original)** marks automatic captions in the video's spoken language.

Files are named `Video Title [videoId] - language.srt`, with `- auto` for automatic captions and `- RAW` for RAW exports. If a file with the same name exists, a number is added.

To paste a subtitle somewhere right away, press ⌘⇧C instead of ↵: the file is saved and its text copied to the clipboard. After a normal download, the toast offers **Copy Text**, and ⌘K offers **Copy Last Subtitle**.

Press ⌘K and choose **Cancel Download** to stop a download. The progress toast has a Cancel button too.

### Favorite languages

Press ⌘K, choose **Edit Favorite Languages**, and enter names or codes separated by commas, for example `Serbian, English, de`. Matching ignores capitalization and `(orig)`, so `serbian`, `Serbian` and `serbian (orig)` all find Serbian. Matches appear in **Favorite Languages** at the top, in the order you wrote them. If nothing matches exactly, the closest languages appear in **Suggested Languages**.

### Playlists and channels

Paste a playlist or channel link into **Download Video**. The list shows **Download Subtitles for N Videos**, **Download MP3**, **M4A** and **MP4 for N Videos**, and every video in it; press ↵ on a video to open it on its own.

Press ↵ on **Download MP3 for N Videos**, or M4A or MP4, to add the whole playlist to the queue. Every video is saved as its own file in a folder named after the playlist or channel, inside your download folder. For more than 20 videos, the extension asks first. Videos that can't be downloaded, such as members-only videos or streams that haven't ended, are skipped and listed in the queue. Videos that already have a file in that format in the folder are not downloaded again.

Press ↵ on **Download Subtitles for N Videos** and choose:

- **Language:** your favorite languages come first.
- **Subtitles:** **Creator subtitles, or automatic captions** (the default) uses the creator's subtitles and falls back to YouTube's automatic captions in the spoken language. **Creator subtitles only** skips videos without them. **Also YouTube's automatic translations** adds machine-translated captions, which download more slowly because YouTube limits how many you can get at once.
- **Format:** RAW, Clean TXT, SRT or VTT.

Press ⌘↵ to add the download to the queue. Each video's subtitles are saved in a folder named after the playlist or channel, inside your download folder. Videos without subtitles in that language are skipped and listed in the queue. Videos that already have a file in that folder are not downloaded again, so you can run the same download later to pick up new videos, or continue one you canceled.

## Audio and video

| Format  | Quality                                                    |
| ------- | ---------------------------------------------------------- |
| **MP3** | Best available audio, converted at the highest MP3 quality |
| **M4A** | Best available audio, saved as M4A                         |
| **MP4** | Best available video with audio, saved as MP4              |

Press ↵ to add the download to the [queue](#the-queue), so it keeps going when you close Raycast. Progress is shown on the row and in the menu bar, and up to three downloads run at once. Press ↵ on a row that is downloading to cancel it.

Files are named `Video Title [videoId].mp3`, `.m4a` or `.mp4`.

### Instagram, X and other sites

Audio and video downloads work the same way on every site yt-dlp supports: paste the link, check the thumbnail and title, and press ↵ on MP3, M4A or MP4. On X the title is the post's text, and on Instagram it's "Video by" and the account name.

- **Posts with several videos**, such as X posts and Instagram carousels, save every video as its own file: `Title [postId] 1.mp4`, `Title [postId] 2.mp4`. Photos in a carousel are skipped. The row shows how many videos the post has.
- **Posts without video**, such as a text-only X post, say so instead of downloading.
- **Videos without sound** download as MP4; MP3 and M4A say the video has no audio.
- **Live streams** can be downloaded after they end.
- **Sign-in:** Instagram shows many posts only to signed-in accounts, and X sometimes limits downloads without an account. Turn on [Browser Sign-In](#browser-sign-in) with the browser you use those sites in.

Only YouTube has subtitle tracks. For other sites the list offers **Transcribe with Whisper** instead. For posts with several videos, every video is transcribed and saved as its own file: `Title [postId] 1 - whisper-Serbian.txt`, `Title [postId] 2 - whisper-Serbian.txt`.

## Transcribe audio and video files

### From Finder

1. Select audio or video files, or folders, in Finder.
2. Open **Transcribe Selected Files**. The selection is already filled in.
3. Check the **Spoken Language**, **Output** and **Model**, then press ⌘↵.

Folders are searched, including subfolders, for audio and video files. If nothing is selected, or Finder wasn't the frontmost app when you opened Raycast, choose files or folders in the form instead.

Assign the command a hotkey or alias in Raycast settings to transcribe the selection with a single shortcut.

### From Download Video

Paste the full path of an audio or video file or a folder into the search bar, for example `/Users/you/Recordings/interview.m4a`. To copy a path in Finder, select the file and press ⌥⌘C. Paths starting with `~/`, paths in quotes, and paths with backslash-escaped spaces copied from Terminal also work. The same form opens.

If you type a path instead of pasting it, the file appears as a row. Press ↵ to open the form, or ⌘↵ to transcribe right away with the language and model shown in the side panel.

### The form

- **Spoken Language:** your favorite languages come first, with the best match selected. All languages supported by whisper.cpp are listed below them, along with **Detect Automatically**. Type to search the list.
- **Output:** **RAW · TXT (all cues)**, **Clean TXT**, **SRT** or **VTT**. RAW is selected by default.
- **Model:** the whisper models found next to your default model. `large-v3-turbo` is fast and accurate; `large-v3` is the most accurate and slowest; quantized models such as `large-v3-turbo-q5_0` are smaller and faster, and slightly less accurate. See [More models](#more-models).
- **Translate to English:** whisper writes an English translation instead of the spoken language. Turbo models were not trained to translate and answer in the spoken language, so choose `large-v3` or `medium` for translation.

Press ⌘↵ to add the files to the queue. The extension converts the audio with ffmpeg to the 16 kHz mono WAV whisper.cpp needs, reading only the first audio track, and transcribes it. WAV files that are already 16 kHz mono 16-bit are not converted at all.

Each result is saved next to its original file as `interview - whisper-Serbian.srt`, `interview - whisper-Serbian - RAW.txt` for RAW, or `interview - whisper-Serbian to English.srt` for a translation. If that folder is not writable, it goes to the download folder instead.

## The queue

Audio and video downloads, playlist downloads and transcriptions run in a background process, so they keep going when you close Raycast. Transcriptions run one at a time, and so do playlist downloads. Up to three audio and video downloads run beside them.

- **Queue** lists running, queued and finished jobs. Cancel a running or queued job with ⌃X. For finished jobs you can open the result, show it in Finder, copy a transcript, try again, or clear the list.
- **Queue in Menu Bar** shows the progress of the running job, for example `42% +2`, and hides itself when the queue is empty. Hold ⌥ to cancel a running job. Jobs that finished in the last 15 minutes stay in the menu, where you can copy a transcript, open the result or show it in Finder.
- When a transcription finishes while Raycast is open, the toast offers **Copy Transcript**.
- When the queue finishes, a macOS notification sums up what was saved. Turn this off with **Notifications** in the preferences.

A transcription that was running when your Mac shut down shows **Stopped before finishing**; choose **Try Again**.

## Transcribe videos without subtitles

If a video has no creator subtitles and no automatic captions, the list shows **Transcribe with Whisper**. Press ↵ to choose the language, output and model, or ⌘↵ to transcribe right away in the language shown and the format selected with ⌘P. The audio is downloaded to a temporary folder and transcribed in the queue, and the result is saved to the download folder as `Video Title [videoId] - whisper-Serbian.srt`.

## Voice activity detection

Whisper tends to invent text when it hears silence or music. A common result is the same line repeated for the whole recording, such as "Hvala što pratite kanal." With **Voice Activity Detection** on (the default), [Silero VAD](https://github.com/snakers4/silero-vad) finds the parts with speech first, and whisper transcribes only those. It is also faster: a 10-minute recording with long pauses takes about 15 seconds with `large-v3-turbo` on an M3.

The first transcription downloads `ggml-silero-v6.2.0.bin` (885 KB) from the [whisper.cpp VAD models](https://huggingface.co/ggml-org/whisper-vad) and checks its checksum. To use your own copy, put it next to your whisper model or select it under **Silero VAD Model**. VAD needs a recent whisper.cpp.

## Set up transcription

The `large-v3-turbo` model is about 1.6 GB and is not included with the extension.

**Option 1: Homebrew**

```sh
brew install whisper.cpp
mkdir -p ~/whisper-models
curl -L -o ~/whisper-models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

In the extension preferences, set **Default Whisper Model** to `ggml-large-v3-turbo.bin` in your `whisper-models` folder. `whisper-cli` is found automatically.

**Option 2: build from source**

```sh
git clone https://github.com/ggml-org/whisper.cpp.git ~/GitHub/whisper.cpp
cd ~/GitHub/whisper.cpp
cmake -B build
cmake --build build --config Release
sh ./models/download-ggml-model.sh large-v3-turbo
```

A checkout at `~/GitHub/whisper.cpp` and its `models/ggml-large-v3-turbo.bin` are found automatically. For a checkout elsewhere, set **whisper.cpp CLI** to its `build/bin/whisper-cli`.

### More models

Every `ggml-*.bin` model in the same folder as your default model appears in the **Model** dropdown. To add one:

```sh
# in a whisper.cpp checkout
sh ./models/download-ggml-model.sh large-v3
sh ./models/download-ggml-model.sh large-v3-turbo-q5_0

# or with curl, into your models folder
curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
```

If you built whisper.cpp with Core ML (`-DWHISPER_COREML=1`), each model also needs its Core ML encoder, such as `ggml-large-v3-encoder.mlmodelc`, next to it. Models without one are marked **needs Core ML encoder**. Create it with `./models/generate-coreml-model.sh large-v3`, or use a build without Core ML. Quantized models use the encoder of their base model.

## Preferences

| Preference                     | Default             | Description                                                                                                         |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Download Folder**            | `~/Downloads`       | Where subtitles, audio, video and YouTube transcriptions are saved. File transcriptions are saved next to the file. |
| **yt-dlp Executable**          | Found automatically | Path to `yt-dlp`                                                                                                    |
| **ffmpeg Executable**          | Found automatically | Path to `ffmpeg`                                                                                                    |
| **Browser Tab**                | On                  | Load the video open in the frontmost browser tab when the clipboard has no video link                               |
| **Browser Sign-In**            | Off                 | The browser whose sign-in yt-dlp uses, for restricted YouTube videos and posts that need an account on other sites  |
| **whisper.cpp CLI**            | Found automatically | Path to `whisper-cli`                                                                                               |
| **Default Whisper Model**      | Next to whisper.cpp | The model selected in the form. Other models in its folder can be chosen when transcribing.                         |
| **Voice Activity Detection**   | On                  | Transcribe only the parts with speech, using Silero VAD                                                             |
| **Silero VAD Model**           | Downloaded          | Path to a Silero VAD model for whisper.cpp                                                                          |
| **Notifications**              | On                  | Show a notification when everything in the queue is done                                                            |
| **Transcription Language**     | `Serbian`           | Spoken language to select when no favorite language matches                                                         |
| **Favorite Caption Languages** | `Serbian`           | Starting value for favorite languages, until you edit them with ⌘K                                                  |

### Browser sign-in

Some videos only play when you're signed in: age-restricted, private and members-only YouTube videos, videos YouTube wants to confirm you're not a bot for, and many Instagram posts. X also limits downloads without an account at times. Choose the browser you're signed in to those sites with under **Browser Sign-In**, and yt-dlp reads that browser's cookies on your Mac.

- **Safari:** macOS protects Safari's cookies. Give Raycast Full Disk Access in System Settings → Privacy & Security → Full Disk Access.
- **Chrome, Brave, Edge and other Chromium browsers:** macOS asks to allow access to the browser's “Safe Storage” key the first time. Choose Always Allow.
- **Firefox:** works without extra permissions.

## Troubleshooting

**"yt-dlp was not found" or "ffmpeg was not found".** Install them with `brew install yt-dlp ffmpeg`, or set their paths in the preferences.

**A video won't load or download.** YouTube changes often, and old yt-dlp versions stop working. When a newer yt-dlp is available, **Download Video** says so and offers **Update yt-dlp**. It runs `brew upgrade yt-dlp`, `pipx upgrade yt-dlp`, `pip install --upgrade yt-dlp` or `yt-dlp -U`, depending on how yt-dlp was installed. The newest version is checked on GitHub at most twice a day.

**"This video is age-restricted", "only for channel members", or "Instagram only shows this to signed-in accounts".** Turn on [Browser Sign-In](#browser-sign-in).

**"X is limiting downloads without an account".** Try again in a moment, or turn on [Browser Sign-In](#browser-sign-in) with the browser you use X in.

**"No speech was found".** The recording has only music, sound effects or silence, so there is nothing to transcribe.

**"HTTP Error 429" on automatic captions.** YouTube is rate limiting requests, which happens most with automatic translations. The extension retries once after 60 seconds. If it still fails, wait a few minutes, or use a creator track or the original-language track.

**The transcript repeats one line, or has text where nobody speaks.** Make sure **Voice Activity Detection** is on.

**"needs Core ML encoder" or "failed to load Core ML model".** See [More models](#more-models).

**"large-v3-turbo can't translate".** Choose `large-v3`, `medium` or another model without "turbo" in its name.

**Transcribe Selected Files doesn't show my selection.** Raycast can only read the selection when Finder is the frontmost app. Click the Finder window, then open the command.

**No notification when the queue finishes.** Notifications come from Script Editor. Allow them in System Settings → Notifications → Script Editor.

**A job says "Stopped before finishing".** The background process was stopped, for example by a restart. Choose **Try Again** in **Queue**.

## Privacy

Everything runs on your Mac. The extension talks only to:

- YouTube, or the site a link is from, for video details, thumbnails, subtitles, audio and video.
- GitHub, to check the newest yt-dlp version at most twice a day.

With **Browser Tab** on, the extension reads the address of your browser's current tab when you open **Download Video** from the browser. It isn't stored or sent anywhere.

- Hugging Face, once, to download the Silero VAD model.

Audio, video and transcripts never leave your computer. With Browser Sign-In on, yt-dlp reads your browser's cookies locally to talk to YouTube; they are not sent anywhere else.

## Development

```sh
npm install
npm run dev    # load the extension in Raycast
npm test
npm run lint
```

`npm run publish` opens a pull request to the Raycast Store. The `author` field in `package.json` must be your Raycast Store username.
