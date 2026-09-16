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
  entryPoints: ["src/core.ts"],
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
  assert.equal(core.pastedYoutubeLink("", link), link);
  assert.equal(core.pastedYoutubeLink("", ` ${link}\n`), link);
  assert.equal(core.pastedYoutubeLink(link.slice(0, -1), link), undefined);
  assert.equal(core.pastedYoutubeLink("", "https://vimeo.com/1"), undefined);
  const other = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(core.pastedYoutubeLink(link, other), other);
  assert.equal(core.pastedYoutubeLink(link, link + other), other);
  assert.equal(
    core.pastedYoutubeLink("https://youtu.be/", "https://youtu.be/jNQXAC9IVRw"),
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
