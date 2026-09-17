import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), "raycast-core-test-"));
const compiled = join(temporary, "core.cjs");
require("esbuild").buildSync({
  stdin: {
    contents:
      'export * from "./src/core"; export * from "./src/whisper"; export * from "./src/updates"; export * from "./src/playlists"; export { queueSummary } from "./src/jobs";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: compiled,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const core = require(compiled);
process.on("exit", () => rmSync(temporary, { recursive: true, force: true }));

test("normalizes common YouTube URL forms and rejects other hosts", () => {
  assert.equal(
    core.youtubeUrl("https://youtu.be/jNQXAC9IVRw?t=3"),
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  );
  assert.equal(
    core.youtubeUrl("https://www.youtube.com/shorts/jNQXAC9IVRw"),
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  );
  assert.throws(() =>
    core.youtubeUrl("https://youtube.com.evil.test/watch?v=jNQXAC9IVRw"),
  );
  assert.throws(() => core.youtubeUrl("file:///etc/passwd"));
});

test("accepts YouTube links without a scheme", () => {
  assert.equal(core.youtubeId("youtu.be/jNQXAC9IVRw"), "jNQXAC9IVRw");
  assert.equal(
    core.youtubeUrl(" m.youtube.com/watch?v=jNQXAC9IVRw&list=PL1 "),
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  );
  assert.equal(core.isYoutubeUrl("hello youtu.be/jNQXAC9IVRw"), false);
  assert.equal(core.isYoutubeUrl("https://vimeo.com/1"), false);
  assert.equal(
    core.mediaUrl("youtu.be/jNQXAC9IVRw?si=abc"),
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  );
  assert.equal(core.mediaUrl("https://vimeo.com/1"), "https://vimeo.com/1");
});

test("detects pasted YouTube links but not typed characters", () => {
  const link = "https://youtu.be/jNQXAC9IVRw?si=abc";
  assert.equal(core.pastedMediaLink("", link), link);
  assert.equal(core.pastedMediaLink("", ` ${link}\n`), link);
  assert.equal(core.pastedMediaLink(link.slice(0, -1), link), undefined);
  assert.equal(core.pastedMediaLink("", "https://example.com/1"), undefined);
  const other = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(core.pastedMediaLink(link, other), other);
  assert.equal(core.pastedMediaLink(link, link + other), other);
  assert.equal(
    core.pastedMediaLink("https://youtu.be/", "https://youtu.be/jNQXAC9IVRw"),
    "https://youtu.be/jNQXAC9IVRw",
  );
});

test("reads absolute file paths from search text", () => {
  const { homedir } = require("node:os");
  assert.equal(core.localPath(" /Users/me/Neue.m4a "), "/Users/me/Neue.m4a");
  assert.equal(core.localPath("~/Music/a b.mp3"), `${homedir()}/Music/a b.mp3`);
  assert.equal(core.localPath("'/tmp/a b.wav'"), "/tmp/a b.wav");
  assert.equal(core.localPath("/tmp/a\\ b\\ \\(1\\).m4a"), "/tmp/a b (1).m4a");
  assert.equal(core.localPath("file:///tmp/a%20b.mp4"), "/tmp/a b.mp4");
  assert.equal(core.localPath("Music/a.mp3"), undefined);
  assert.equal(core.localPath("https://youtu.be/jNQXAC9IVRw"), undefined);
  assert.equal(core.pastedFilePath("", "/tmp/a.m4a"), "/tmp/a.m4a");
  assert.equal(core.pastedFilePath("/tmp/a.m4", "/tmp/a.m4a"), undefined);
  assert.equal(
    core.pastedFilePath("/Users/me/Neue.m4a", "/Users/me/Other.m4a"),
    "/Users/me/Other.m4a",
  );
  assert.equal(core.pastedFilePath("", "serbian"), undefined);
});

test("recognizes WAV files whisper.cpp can read without conversion", () => {
  const wav = (channels, sampleRate, bits, extra = 0) => {
    const header = Buffer.alloc(44 + extra);
    header.write("RIFF", 0, "ascii");
    header.write("WAVE", 8, "ascii");
    let offset = 12;
    if (extra) {
      header.write("LIST", offset, "ascii");
      header.writeUInt32LE(extra - 8, offset + 4);
      offset += extra;
    }
    header.write("fmt ", offset, "ascii");
    header.writeUInt32LE(16, offset + 4);
    header.writeUInt16LE(1, offset + 8);
    header.writeUInt16LE(channels, offset + 10);
    header.writeUInt32LE(sampleRate, offset + 12);
    header.writeUInt16LE(bits, offset + 22);
    return header;
  };
  assert.equal(core.isWhisperWavHeader(wav(1, 16000, 16)), true);
  assert.equal(core.isWhisperWavHeader(wav(1, 16000, 16, 26)), true);
  assert.equal(core.isWhisperWavHeader(wav(2, 16000, 16)), false);
  assert.equal(core.isWhisperWavHeader(wav(1, 44100, 16)), false);
  assert.equal(core.isWhisperWavHeader(Buffer.from("ID3 not a wav")), false);
});

test("lists whisper.cpp languages and formats file sizes", () => {
  assert.equal(core.whisperLanguages.length, 100);
  assert.equal(core.whisperLanguageName("sr"), "Serbian");
  assert.equal(core.defaultWhisperLanguage("serbian (orig), English"), "sr");
  assert.equal(core.defaultWhisperLanguage("", "English"), "en");
  assert.equal(core.defaultWhisperLanguage("Klingon", "auto"), "auto");
  assert.equal(core.whisperLanguageName("auto"), "Detect Automatically");
  assert.equal(core.formatSize(512), "512 bytes");
  assert.equal(core.formatSize(12_345_678), "12 MB");
  assert.equal(core.formatSize(1_624_555_275), "1.6 GB");
});

test("media lookup refuses local file URLs before invoking yt-dlp", async () => {
  await assert.rejects(
    core.inspectMedia("file:///etc/passwd", {}),
    /HTTP or HTTPS/,
  );
});

test("shows readable language names for caption selection", () => {
  assert.equal(core.languageLabel("sr"), "Serbian");
  assert.equal(core.languageLabel("en"), "English");
  assert.equal(core.languageLabel("sr-orig"), "Serbian (Original)");
});

test("favorite language text matches case and original-caption variants", () => {
  const tracks = ["sr", "sr-orig", "serbian (orig)"].map((language) => ({
    language,
    kind: "automatic",
    formats: ["vtt"],
  }));
  for (const track of tracks) {
    assert.equal(core.favoriteScore(track, "Serbian"), 100);
    assert.equal(core.favoriteScore(track, "serbian (orig)"), 100);
  }
  assert.ok(core.favoriteScore(tracks[0], "srbn") >= 30);
  assert.deepEqual(core.favoriteLanguageTerms("Serbian, English;de\nfr"), [
    "Serbian",
    "English",
    "de",
    "fr",
  ]);
});

test("ranks favorite language matches first and suggests close matches", () => {
  const languages = [
    { code: "en", name: "English" },
    { code: "sr", name: "Serbian" },
    { code: "hr", name: "Croatian" },
  ];
  const names = (language) => [language.code, language.name];
  assert.deepEqual(
    core
      .rankFavorites(languages, names, "croatian, serbian (orig)")
      .favorites.map((language) => language.code),
    ["hr", "sr"],
  );
  const fuzzy = core.rankFavorites(languages, names, "srbian");
  assert.deepEqual(fuzzy.favorites, []);
  assert.deepEqual(
    fuzzy.suggestions.map((language) => language.code),
    ["sr"],
  );
});

test("identifies creator and automatic language tracks and ignores live chat", () => {
  const video = core.parseVideo(
    {
      id: "jNQXAC9IVRw",
      title: "Example",
      subtitles: { sr: [{ ext: "vtt" }], live_chat: [{ ext: "json" }] },
      automatic_captions: { en: [{ ext: "json3" }, { ext: "vtt" }] },
    },
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  );
  assert.deepEqual(video.captions, [
    { language: "en", kind: "automatic", formats: ["json3", "vtt"] },
    { language: "sr", kind: "manual", formats: ["vtt"] },
  ]);
});

test("reads thumbnail, channel, duration and upload date for the preview", () => {
  const video = core.parseVideo(
    {
      id: "dQw4w9WgXcQ",
      title: "Example",
      thumbnail: "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp",
      uploader: "Uploader",
      duration: 213,
      upload_date: "20091025",
    },
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(
    video.thumbnail,
    "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp",
  );
  assert.equal(video.channel, "Uploader");
  assert.equal(video.uploadDate, "2009-10-25");
  assert.equal(core.formatDuration(video.duration), "3:33");
  assert.equal(core.formatDuration(3723), "1:02:03");
  assert.equal(
    core.youtubeThumbnail("https://youtu.be/dQw4w9WgXcQ"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  );
  assert.equal(
    core.parseVideo(
      { id: "x", title: "x", thumbnail: "file:///etc/passwd" },
      "https://example.com",
    ).thumbnail,
    undefined,
  );
});

test("plain text removes cue timing and adjacent repeated captions", () => {
  const input =
    "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello &amp; welcome\n\n00:00:02.000 --> 00:00:03.000\nHello &amp; welcome\n\n00:00:03.000 --> 00:00:04.000\n<c>Next line</c>\n";
  assert.equal(core.vttToText(input), "Hello & welcome\nNext line\n");
});

test("RAW writes readable repeated cue text without timing as TXT content", () => {
  const input =
    "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n\n00:00:02.000 --> 00:00:03.000\nHello\n\n00:00:03.000 --> 00:00:04.000\n<c>world</c>\n";
  assert.equal(core.rawCaptionText(input, "vtt"), "Hello\nHello\nworld\n");
  assert.equal(core.vttToText(input), "Hello\nworld\n");
});

test("plain text handles rolling captions and blank lines inside cues", () => {
  const input =
    "1\n00:00:01,000 --> 00:00:02,000\n\nHello world\n\n2\n00:00:02,000 --> 00:00:03,000\nworld again\n\n3\n00:00:03,000 --> 00:00:04,000\n\nagain today\n";
  assert.equal(core.vttToText(input), "Hello world\nagain\ntoday\n");
});

test("SRT export removes empty cues and renumbers valid cues", () => {
  const input =
    "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:03,000\n  \n\n3\n00:00:03,000 --> 00:00:04,000\n\nWorld\n";
  assert.equal(
    core.cleanSrt(input),
    "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n",
  );
});

test("names transcripts and knows which models can translate", () => {
  assert.equal(core.transcriptSuffix("sr"), "whisper-Serbian");
  assert.equal(core.transcriptSuffix("sr", true), "whisper-Serbian to English");
  assert.equal(core.transcriptSuffix("auto", true), "whisper-auto to English");
  assert.equal(core.transcriptSuffix("en", true), "whisper-English");
  assert.equal(core.canTranslate("/m/ggml-large-v3-turbo-q5_0.bin"), false);
  assert.equal(core.canTranslate("/m/ggml-large-v3.bin"), true);
  assert.equal(core.modelName("/m/ggml-medium.en.bin"), "medium.en");
  assert.equal(
    core.coreMlEncoder("/m/ggml-large-v3-turbo-q5_0.bin"),
    "/m/ggml-large-v3-turbo-encoder.mlmodelc",
  );
});

test("finds audio and video files in chosen folders", () => {
  const { mkdirSync, writeFileSync } = require("node:fs");
  const root = join(temporary, "media");
  for (const folder of ["Show", "Show/Season 1", "Show/.hidden", "Tool.app"])
    mkdirSync(join(root, folder), { recursive: true });
  for (const file of [
    "Show/Episode 10.mp4",
    "Show/Episode 2.m4a",
    "Show/notes.txt",
    "Show/Season 1/Intro.WAV",
    "Show/.hidden/secret.mp3",
    "Show/.DS_Store",
    "Tool.app/sound.mp3",
    "notes.txt",
  ])
    writeFileSync(join(root, file), "");
  const names = (paths) => paths.map((path) => path.slice(root.length + 1));
  assert.deepEqual(names(core.mediaFiles([join(root, "Show")])), [
    "Show/Episode 2.m4a",
    "Show/Episode 10.mp4",
    "Show/Season 1/Intro.WAV",
  ]);
  assert.deepEqual(
    names(
      core.mediaFiles([
        join(root, "notes.txt"),
        join(root, "Show/Episode 2.m4a"),
        root,
      ]),
    ),
    [
      "notes.txt",
      "Show/Episode 2.m4a",
      "Show/Episode 10.mp4",
      "Show/Season 1/Intro.WAV",
    ],
  );
});

test("summarizes yt-dlp media progress", () => {
  assert.equal(
    core.mediaProgress("[download]  45.7% of   12.34MiB at  2.00MiB/s", "mp4"),
    "Downloading MP4… 45%",
  );
  assert.equal(
    core.mediaProgress('[Merger] Merging formats into "x.mp4"', "mp4"),
    "Merging audio and video…",
  );
  assert.equal(
    core.mediaProgress("[ExtractAudio] Destination: x.mp3", "mp3"),
    "Converting to MP3…",
  );
  assert.equal(
    core.mediaProgress("[youtube] jNQXAC9IVRw: Downloading", "mp3"),
    undefined,
  );
});

test("uses browser sign-in only when chosen and explains sign-in errors", () => {
  const error = (message) => new Error(`yt-dlp failed (1): ERROR: ${message}`);
  const explain = (message, settings = {}) =>
    core.explainYtDlpError(error(message), settings).message;
  assert.match(
    explain("[youtube] x: Sign in to confirm your age."),
    /age-restricted\. To use your YouTube account, choose your browser under Browser Sign-In/,
  );
  assert.match(
    explain("[youtube] x: Sign in to confirm your age.", {
      browserCookies: "chrome",
    }),
    /signed in to YouTube in Chrome/,
  );
  assert.match(
    explain("could not find firefox cookies database in /x", {
      browserCookies: "firefox",
    }),
    /couldn't find Firefox's cookies/,
  );
  assert.match(
    explain("[Errno 1] Operation not permitted: '/x/Cookies.binarycookies'", {
      browserCookies: "safari",
    }),
    /Full Disk Access/,
  );
  assert.match(explain("HTTP Error 429: Too Many Requests"), /HTTP Error 429/);
  const canceled = core.canceledError();
  assert.equal(core.explainYtDlpError(canceled, {}), canceled);
});

test("compares yt-dlp versions and picks the update command", () => {
  const updates = require(compiled);
  assert.equal(updates.compareVersions("2026.08.19", "2026.09.01"), -1);
  assert.equal(updates.compareVersions("2026.9.1", "2026.09.01"), 0);
  assert.equal(updates.compareVersions("2026.09.01.1", "2026.09.01"), 1);
  assert.deepEqual(
    updates.updateCommand(
      "/opt/homebrew/bin/yt-dlp",
      "/opt/homebrew/Cellar/yt-dlp/2026.8.19_1/bin/yt-dlp",
      "#!/opt/homebrew/Cellar/yt-dlp/2026.8.19_1/libexec/bin/python",
    ).args,
    ["upgrade", "yt-dlp"],
  );
  assert.equal(
    updates.updateCommand(
      "/opt/homebrew/bin/yt-dlp",
      "/opt/homebrew/Cellar/yt-dlp/2026.8.19_1/bin/yt-dlp",
      "",
    ).bin,
    "/opt/homebrew/bin/brew",
  );
  assert.equal(
    updates.updateCommand(
      "/u/.local/bin/yt-dlp",
      "/u/.local/pipx/venvs/yt-dlp/bin/yt-dlp",
      "#!/u/.local/pipx/venvs/yt-dlp/bin/python",
    ).display,
    "pipx upgrade yt-dlp",
  );
  assert.equal(
    updates.updateCommand(
      "/usr/local/bin/yt-dlp",
      "/usr/local/bin/yt-dlp",
      "#!/usr/bin/env python3",
    ).display,
    "python3 -m pip install --upgrade yt-dlp",
  );
  assert.deepEqual(
    updates.updateCommand(
      "/usr/local/bin/yt-dlp",
      "/usr/local/bin/yt-dlp",
      "Ïúíþ",
    ).args,
    ["-U"],
  );
});

test("recognizes playlist and channel links", () => {
  assert.equal(
    core.youtubeCollectionUrl("youtube.com/playlist?list=PLabc_123-x&si=1"),
    "https://www.youtube.com/playlist?list=PLabc_123-x",
  );
  assert.equal(
    core.youtubeCollectionUrl(
      "https://music.youtube.com/playlist?list=OLAK5uy_x",
    ),
    "https://www.youtube.com/playlist?list=OLAK5uy_x",
  );
  assert.equal(
    core.youtubeCollectionUrl("https://www.youtube.com/@jawed/videos/"),
    "https://www.youtube.com/@jawed/videos",
  );
  assert.equal(
    core.youtubeCollectionUrl("m.youtube.com/channel/UC4QobU6STFB0P71PMvOGN5A"),
    "https://www.youtube.com/channel/UC4QobU6STFB0P71PMvOGN5A",
  );
  assert.equal(
    core.youtubeCollectionUrl("https://www.youtube.com/@jawed/community"),
    undefined,
  );
  assert.equal(
    core.youtubeCollectionUrl(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL1",
    ),
    undefined,
  );
  assert.equal(core.youtubeCollectionUrl("https://vimeo.com/@x"), undefined);
  assert.equal(
    core.youtubePlaylistOf(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLxyz",
    ),
    "https://www.youtube.com/playlist?list=PLxyz",
  );
  assert.equal(
    core.mediaUrl("youtube.com/@jawed"),
    "https://www.youtube.com/@jawed",
  );
  assert.equal(
    core.pastedMediaLink("", "https://www.youtube.com/@jawed"),
    "https://www.youtube.com/@jawed",
  );
  assert.equal(
    core.pastedMediaLink(
      "https://www.youtube.com/@jawe",
      "https://www.youtube.com/@jawed",
    ),
    undefined,
  );
});

test("flattens channel tabs and picks captions for playlist downloads", () => {
  const playlist = core.parsePlaylist(
    {
      id: "@x",
      title: "Channel",
      channel: "Channel",
      entries: [
        {
          _type: "playlist",
          title: "Channel - Videos",
          entries: [
            { id: "aaaaaaaaaaa", title: "One", duration: 61 },
            { id: "bbbbbbbbbbb", title: "Two" },
          ],
        },
        {
          _type: "playlist",
          title: "Channel - Shorts",
          entries: [
            { id: "bbbbbbbbbbb", title: "Two" },
            { id: "ccccccccccc", title: "Short" },
          ],
        },
      ],
    },
    "https://www.youtube.com/@x",
  );
  assert.deepEqual(
    playlist.entries.map((entry) => entry.title),
    ["One", "Two", "Short"],
  );
  assert.equal(
    playlist.thumbnail,
    "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg",
  );
  const captions = [
    { language: "en", kind: "automatic", formats: ["vtt"] },
    { language: "sr-orig", kind: "automatic", formats: ["vtt"] },
    { language: "sr", kind: "automatic", formats: ["vtt"] },
    { language: "iw", kind: "manual", formats: ["vtt"] },
  ];
  assert.equal(core.pickCaption(captions, "sr", "any").language, "sr-orig");
  assert.equal(core.pickCaption(captions, "sr", "manual"), undefined);
  assert.equal(
    core.pickCaption(
      [...captions, { language: "sr-Latn", kind: "manual", formats: ["vtt"] }],
      "sr",
      "any",
    ).language,
    "sr-Latn",
  );
  assert.equal(core.pickCaption(captions, "he", "manual").language, "iw");
  // English is a translation of the Serbian speech
  assert.equal(core.pickCaption(captions, "en", "any"), undefined);
  assert.equal(core.pickCaption(captions, "en", "translated").language, "en");
  // without an -orig track, automatic captions count as the spoken language
  assert.equal(
    core.pickCaption(
      [{ language: "en", kind: "automatic", formats: ["vtt"] }],
      "en",
      "any",
    ).language,
    "en",
  );
  const files = [
    "One [aaaaaaaaaaa] - sr-orig - auto.srt",
    "Two [bbbbbbbbbbb] - en - RAW.txt",
  ];
  assert.equal(
    core.alreadySaved(files, { id: "aaaaaaaaaaa" }, "sr", "srt"),
    files[0],
  );
  assert.equal(
    core.alreadySaved(files, { id: "aaaaaaaaaaa" }, "sr", "vtt"),
    undefined,
  );
  assert.equal(
    core.alreadySaved(files, { id: "bbbbbbbbbbb" }, "en", "raw"),
    files[1],
  );
  assert.equal(
    core.alreadySaved(files, { id: "bbbbbbbbbbb" }, "en", "txt"),
    undefined,
  );
});

test("summarizes a finished queue", () => {
  const file = (status, error) => ({
    title: "a.m4a",
    status,
    error,
    spec: { kind: "file" },
  });
  assert.equal(
    core.queueSummary([file("done"), file("done")]),
    "2 transcriptions saved",
  );
  assert.equal(
    core.queueSummary([file("failed", "No audio")]),
    "a.m4a: No audio",
  );
  assert.equal(
    core.queueSummary([file("done"), file("failed", "x")]),
    "1 of 2 transcriptions saved, 1 failed",
  );
  assert.equal(core.queueSummary([file("canceled")]), undefined);
  assert.equal(
    core.queueSummary([
      {
        title: "Talks",
        status: "done",
        outputs: ["a", "b"],
        skipped: [{}],
        spec: { kind: "playlist" },
      },
    ]),
    "Talks: subtitles for 2 of 3 videos saved",
  );
});

test("recognizes links from other video sites", () => {
  assert.equal(
    core.videoSite("https://x.com/nasa/status/1234567890?s=20"),
    "X",
  );
  assert.equal(core.videoSite("twitter.com/i/status/1"), "X");
  assert.equal(core.videoSite("https://x.com/nasa"), undefined);
  assert.equal(
    core.videoSite("https://www.instagram.com/reel/Cop84x6u7CP/?igsh=1"),
    "Instagram",
  );
  assert.equal(core.videoSite("instagram.com/p/BQ0eAlwhDrw"), "Instagram");
  assert.equal(
    core.videoSite("https://www.instagram.com/enbiggen/"),
    undefined,
  );
  assert.equal(core.videoSite("https://vm.tiktok.com/ZMabc123/"), "TikTok");
  assert.equal(core.videoSite("https://www.twitch.tv/shroud"), undefined);
  assert.equal(
    core.videoSite("https://www.bilibili.com/video/BV13x41117TL"),
    "Bilibili",
  );
  assert.equal(core.videoSite("https://example.com/video.mp4"), undefined);
  assert.equal(
    core.mediaUrl("instagram.com/reel/abc/"),
    "https://instagram.com/reel/abc/",
  );
  const reel = "https://www.instagram.com/reel/Cop84x6u7CP/";
  assert.equal(core.pastedMediaLink("", reel), reel);
  assert.equal(core.pastedMediaLink(reel.slice(0, -1), reel), undefined);
  assert.equal(
    core.pastedMediaLink("", "https://example.com/video"),
    undefined,
  );
});

test("explains errors from other sites", () => {
  const explain = (message, settings = {}) =>
    core.explainYtDlpError(
      new Error(`yt-dlp failed (1): ERROR: ${message}`),
      settings,
    ).message;
  assert.match(
    explain(
      "[Instagram] abc: Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in. If it is not, then use --cookies-from-browser or --cookies",
    ),
    /^Instagram only shows this to signed-in accounts\. To use your Instagram account, choose your browser/,
  );
  assert.match(
    explain("[twitter] 1: NSFW tweet requires authentication. Use --cookies", {
      browserCookies: "safari",
    }),
    /^X only shows this to signed-in accounts\. Make sure you're signed in to X in Safari\./,
  );
  assert.match(
    explain("[twitter] 1: Error(s) while querying API: Bad guest token"),
    /^X is limiting downloads/,
  );
  assert.equal(
    explain("[twitter] 1: No video could be found in this tweet"),
    "This post has no video.",
  );
  assert.match(
    explain("Unsupported URL: https://example.com/"),
    /^There's no video yt-dlp can download/,
  );
  assert.match(
    explain(
      "[vimeo] 1: The web client only works when logged-in. Use --cookies",
    ),
    /^Vimeo only shows this/,
  );
});

test("counts the videos in a multi-video post", () => {
  const post = core.parseVideo(
    {
      _type: "playlist",
      id: "1395079556562706435",
      title: "Mr. Chau - Here it is",
      entries: [
        { id: "a", thumbnail: "https://pbs.twimg.com/a.jpg" },
        { id: "b" },
      ],
    },
    "https://x.com/a/status/1395079556562706435",
  );
  assert.equal(post.items, 2);
  assert.equal(post.thumbnail, "https://pbs.twimg.com/a.jpg");
  assert.equal(
    core.parseVideo({ id: "x", title: "t", is_live: true }, "u").isLive,
    true,
  );
  assert.equal(
    core.mediaProgress("[download] Downloading item 2 of 3", "mp4"),
    "Downloading 2 of 3…",
  );
});
