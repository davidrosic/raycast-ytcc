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
