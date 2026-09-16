# YouTube Download

Save YouTube subtitles in any available language as RAW text, clean text, SRT or VTT. Download the video's audio or video too. Transcribe videos without subtitles, or any audio or video file on your Mac, with [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and the `large-v3-turbo` model.

- **Copy a link, open the command.** A YouTube link in your clipboard loads right away, with no extra steps.
- **See what you're downloading.** The video's thumbnail and title appear as soon as the link is recognized.
- **Every subtitle track.** Creator subtitles, YouTube's automatic captions, and auto-translations are all listed.
- **Your languages first.** Favorite languages are listed at the top, and `serbian`, `Serbian` and `serbian (orig)` all match the same language.
- **Audio and video.** Save MP3, M4A or MP4 in the best available quality.
- **Transcribe your own files.** Paste the path of a recording, pick the spoken language and output format, and press ⌘↵.
- **Local transcription.** Audio is never uploaded to a transcription service.

## Requirements

| Tool                                                           | Needed for                       | Install                                       |
| -------------------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)                     | Everything                       | `brew install yt-dlp`                         |
| [ffmpeg](https://ffmpeg.org)                                   | MP3, M4A, MP4, and transcription | `brew install ffmpeg`                         |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) + model | Transcription only               | [Set up transcription](#set-up-transcription) |

```sh
brew install yt-dlp ffmpeg
```

The extension finds these tools in your `PATH`, `/opt/homebrew/bin`, or `/usr/local/bin`. If yours are elsewhere, set their paths in the extension preferences.

## How to use it

1. Copy a YouTube link.
2. Open **YouTube Download**. The link is placed in the search bar and the video starts loading.
3. Check the thumbnail and title in the side panel.
4. Choose a subtitle format from the dropdown (⌘P). **RAW** is selected by default.
5. Select a language and press ↵.

Files are saved to `~/Downloads` unless you choose another folder in the preferences.

Already opened the command? Paste a link with ⌘V and it loads immediately, replacing the current video.

| Key  | Action                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------- |
| ↵    | Download the selected language in the chosen format, or the selected audio/video format                  |
| ⌘P   | Choose the subtitle format                                                                               |
| ⌘K   | More actions: other subtitle formats, Show Last File in Finder, Edit Favorite Languages, and preferences |
| Type | Filter the list, for example `english` or `mp3`                                                          |
| ⌘V   | Paste a YouTube link and load it, or paste a file path to transcribe it                                  |
| Esc  | Clear the search bar; press again to close                                                               |

### Supported links

YouTube `watch`, `youtu.be`, Shorts, Live and embed links, including `m.youtube.com` and `music.youtube.com`, with or without `https://`. Playlist and timestamp parameters are ignored; each search loads one video.

Links typed by hand, or from other sites [supported by yt-dlp](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md), show **Search This Link**. Press ↵ to load them.

## Subtitles

| Format                   | File        | What you get                                                                                                                                |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **RAW · TXT (all cues)** | `- RAW.txt` | The text of every caption cue in order, without timestamps. Automatic captions repeat each line as it scrolls, and RAW keeps those repeats. |
| **Clean TXT**            | `.txt`      | Readable plain text with the scrolling repeats removed.                                                                                     |
| **SRT**                  | `.srt`      | Timed subtitles for video players and editors. Empty cues are removed and the rest renumbered.                                              |
| **VTT**                  | `.vtt`      | Timed WebVTT subtitles as YouTube provides them.                                                                                            |

Rows marked **Creator** are subtitles uploaded by the channel. Rows marked **Automatic** are YouTube's speech recognition and machine translations. **(Original)** marks automatic captions in the video's spoken language.

Files are named `Video Title [videoId] - language.srt`, with `- auto` for automatic captions and `- RAW` for RAW exports. If a file with the same name exists, a number is added.

### Favorite languages

Press ⌘K, choose **Edit Favorite Languages**, and enter names or codes separated by commas, for example `Serbian, English, de`. Matching ignores capitalization and `(orig)`, so `serbian`, `Serbian` and `serbian (orig)` all find Serbian. Matches appear in **Favorite Languages** at the top. If nothing matches exactly, the closest languages appear in **Suggested Languages**.

## Audio and video

| Format  | Quality                                                    |
| ------- | ---------------------------------------------------------- |
| **MP3** | Best available audio, converted at the highest MP3 quality |
| **M4A** | Best available audio, saved as M4A                         |
| **MP4** | Best available video with audio, saved as MP4              |

Files are named `Video Title [videoId].mp3`, `.m4a` or `.mp4`. Progress is shown on the row while it downloads.

## Transcribe audio and video files

Paste the full path of an audio or video file into the search bar, for example `/Users/you/Recordings/interview.m4a`. To copy a path in Finder, select the file and press ⌥⌘C. Paths starting with `~/`, paths in quotes, and paths with backslash-escaped spaces copied from Terminal also work.

A form opens with two dropdowns:

- **Spoken Language**: your favorite languages come first, with the best match selected. All languages supported by whisper.cpp are listed below them, along with **Detect Automatically**. Type to search the list.
- **Output**: **RAW · TXT (all cues)**, **Clean TXT**, **SRT** or **VTT**. RAW is selected by default.

Press ⌘↵ to start. The extension converts the audio with ffmpeg to the 16 kHz mono WAV whisper.cpp needs, then transcribes it with `ggml-large-v3-turbo.bin`. Conversion reads only the first audio track and takes a few seconds even for long recordings. WAV files that are already 16 kHz mono 16-bit are not converted at all. Progress is shown on the row and in a toast.

The result is saved next to the original file as `interview - whisper-Serbian.srt`, or `interview - whisper-Serbian - RAW.txt` for RAW. If that folder is not writable, it goes to the download folder instead.

If you type a path instead of pasting it, the file appears as a row. Press ↵ to open the form, or ⌘↵ to transcribe right away with the language and output shown in the side panel.

## Transcribe videos without subtitles

If a video has no creator subtitles and no automatic captions, the list shows **Transcribe with Whisper**. The extension downloads the audio to a temporary folder, converts it to 16 kHz mono WAV, and runs whisper.cpp with the `ggml-large-v3-turbo.bin` model. It saves three files: `Video Title [videoId] - whisper-Serbian.srt`, `.vtt` and `.txt`. Temporary audio is deleted afterwards.

### Set up transcription

The model is about 1.6 GB and is not included with the extension. Its file must be named `ggml-large-v3-turbo.bin`.

**Option 1: Homebrew**

```sh
brew install whisper.cpp
mkdir -p ~/whisper-models
curl -L -o ~/whisper-models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

In the extension preferences, set **Large V3 Turbo Model** by selecting `ggml-large-v3-turbo.bin` in your `whisper-models` folder. `whisper-cli` is found automatically.

**Option 2: build from source**

```sh
git clone https://github.com/ggml-org/whisper.cpp.git ~/GitHub/whisper.cpp
cd ~/GitHub/whisper.cpp
cmake -B build
cmake --build build --config Release
sh ./models/download-ggml-model.sh large-v3-turbo
```

A checkout at `~/GitHub/whisper.cpp` is found automatically. For a checkout elsewhere, set **whisper.cpp CLI** to its `build/bin/whisper-cli`; the model in its `models` folder is then found automatically.

Set **Transcription Language** to the language spoken in the video, for example `Serbian`, `English` or `auto`. The default is `Serbian`.

## Preferences

| Preference                     | Default             | Description                                                                                                       |
| ------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Download Folder**            | `~/Downloads`       | Where YouTube downloads and transcriptions are saved. File transcriptions are saved next to the file.             |
| **yt-dlp Executable**          | Found automatically | Path to `yt-dlp`                                                                                                  |
| **ffmpeg Executable**          | Found automatically | Path to `ffmpeg`                                                                                                  |
| **whisper.cpp CLI**            | Found automatically | Path to `whisper-cli`                                                                                             |
| **Large V3 Turbo Model**       | Next to whisper.cpp | Path to `ggml-large-v3-turbo.bin`                                                                                 |
| **Transcription Language**     | `Serbian`           | Spoken language for YouTube videos without subtitles, and the default for files when no favorite language matches |
| **Favorite Caption Languages** | `Serbian`           | Starting value for favorite languages, until you edit them with ⌘K                                                |

## Troubleshooting

**"yt-dlp was not found" or "ffmpeg was not found".** Install them with `brew install yt-dlp ffmpeg`, or set their paths in the preferences.

**A video won't load or download.** YouTube changes often, so update yt-dlp first with `brew upgrade yt-dlp`. Private, members-only and some age-restricted videos may not work, because the extension doesn't use your browser's sign-in.

**"HTTP Error 429" on automatic captions.** YouTube is rate limiting requests, which happens most with auto-translated languages. The extension retries once after 60 seconds. If it still fails, wait a few minutes, or use a creator track or the original-language track.

**Transcribe with Whisper is not shown.** It only appears for videos with no subtitles of any kind. For videos that have captions, download a caption track instead.

**"ggml-large-v3-turbo.bin was not found".** Set **Large V3 Turbo Model** to the model file, and make sure the file name is exactly `ggml-large-v3-turbo.bin`.

## Privacy

Everything runs on your Mac. The extension talks only to YouTube, or the site you search, to read video details, thumbnails and subtitles. Audio, video and transcripts never leave your computer.

## Development

```sh
npm install
npm run dev    # load the extension in Raycast
npm test
npm run lint
```

`npm run publish` opens a pull request to the Raycast Store. The `author` field in `package.json` must be your Raycast Store username.
