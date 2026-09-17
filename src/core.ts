import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CaptionKind = "manual" | "automatic";
export type ExportFormat = "srt" | "vtt" | "txt" | "raw";
export type MediaFormat = "mp3" | "m4a" | "mp4";
export type Caption = {
  language: string;
  kind: CaptionKind;
  formats: string[];
};
export type Video = {
  id: string;
  title: string;
  url: string;
  captions: Caption[];
  thumbnail?: string;
  channel?: string;
  duration?: number;
  uploadDate?: string;
};
export type VideoPreview = {
  title?: string;
  channel?: string;
  thumbnail?: string;
};
export type Settings = {
  downloadDirectory?: string;
  ytDlpPath?: string;
  ffmpegPath?: string;
  whisperPath?: string;
  modelPath?: string;
  whisperLanguage?: string;
  favoriteLanguages?: string;
};

export function youtubeId(input: string): string {
  const value = input.trim();
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
    );
  } catch {
    throw new Error("Enter a valid YouTube video URL.");
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Enter a YouTube video URL.");
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ].includes(host)
  ) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (/^\/(shorts|live|embed)\//.test(url.pathname))
      id = url.pathname.split("/")[2];
  } else if (["youtu.be", "www.youtu.be"].includes(host))
    id = url.pathname.split("/")[1];
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new Error(
      "Enter a single YouTube video URL (watch, short, live or youtu.be).",
    );
  return id;
}

export function youtubeUrl(input: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId(input)}`;
}

export function isYoutubeUrl(input: string): boolean {
  try {
    youtubeId(input);
    return true;
  } catch {
    return false;
  }
}

export function mediaUrl(input: string): string {
  if (isYoutubeUrl(input)) return youtubeUrl(input);
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid video URL.");
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Enter an HTTP or HTTPS video URL.");
  return url.toString();
}

/** The text that changed between two values of a text field. */
function insertedText(previous: string, next: string): string {
  let start = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  )
    start++;
  let end = 0;
  while (
    end < previous.length - start &&
    end < next.length - start &&
    previous[previous.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  return next.slice(start, next.length - end);
}

/** Returns the YouTube link a paste produced, or undefined for typing and edits. */
export function pastedYoutubeLink(
  previous: string,
  next: string,
): string | undefined {
  const pasted = insertedText(previous, next).trim();
  const value = next.trim();
  if (pasted.length < 2) return undefined;
  if (isYoutubeUrl(pasted))
    return isYoutubeUrl(value) && youtubeId(value) === youtubeId(pasted)
      ? value
      : pasted;
  return isYoutubeUrl(value) ? value : undefined;
}

/**
 * An absolute file path from search text. Accepts `~/`, surrounding quotes,
 * `file://` URLs and spaces escaped with a backslash, as Terminal writes them.
 */
export function localPath(input: string): string | undefined {
  let value = input.trim();
  if (/^(['"]).+\1$/.test(value)) value = value.slice(1, -1);
  if (/^file:\/\//i.test(value)) {
    try {
      return fileURLToPath(value);
    } catch {
      return undefined;
    }
  }
  if (value === "~" || value.startsWith("~/"))
    value = join(homedir(), value.slice(1));
  if (!value.startsWith("/")) return undefined;
  return value.replace(/\\([ '"()&!])/g, "$1");
}

/** Returns the search text a pasted file path produced, or undefined for typing and edits. */
export function pastedFilePath(
  previous: string,
  next: string,
): string | undefined {
  const pasted = insertedText(previous, next).trim();
  if (pasted.length < 2) return undefined;
  if (localPath(pasted)) return pasted;
  return localPath(next) ? next.trim() : undefined;
}

export function localFileInfo(
  path: string,
): { isFile: boolean; size: number; modified: Date } | undefined {
  try {
    const info = statSync(path);
    return { isFile: info.isFile(), size: info.size, modified: info.mtime };
  } catch {
    return undefined;
  }
}

export function formatSize(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return unit
    ? `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
    : `${bytes} bytes`;
}

/** Languages supported by whisper.cpp; codes are passed to whisper-cli with -l. */
export const whisperLanguages: { code: string; name: string }[] = [
  ["en", "English"],
  ["zh", "Chinese"],
  ["de", "German"],
  ["es", "Spanish"],
  ["ru", "Russian"],
  ["ko", "Korean"],
  ["fr", "French"],
  ["ja", "Japanese"],
  ["pt", "Portuguese"],
  ["tr", "Turkish"],
  ["pl", "Polish"],
  ["ca", "Catalan"],
  ["nl", "Dutch"],
  ["ar", "Arabic"],
  ["sv", "Swedish"],
  ["it", "Italian"],
  ["id", "Indonesian"],
  ["hi", "Hindi"],
  ["fi", "Finnish"],
  ["vi", "Vietnamese"],
  ["he", "Hebrew"],
  ["uk", "Ukrainian"],
  ["el", "Greek"],
  ["ms", "Malay"],
  ["cs", "Czech"],
  ["ro", "Romanian"],
  ["da", "Danish"],
  ["hu", "Hungarian"],
  ["ta", "Tamil"],
  ["no", "Norwegian"],
  ["th", "Thai"],
  ["ur", "Urdu"],
  ["hr", "Croatian"],
  ["bg", "Bulgarian"],
  ["lt", "Lithuanian"],
  ["la", "Latin"],
  ["mi", "Maori"],
  ["ml", "Malayalam"],
  ["cy", "Welsh"],
  ["sk", "Slovak"],
  ["te", "Telugu"],
  ["fa", "Persian"],
  ["lv", "Latvian"],
  ["bn", "Bengali"],
  ["sr", "Serbian"],
  ["az", "Azerbaijani"],
  ["sl", "Slovenian"],
  ["kn", "Kannada"],
  ["et", "Estonian"],
  ["mk", "Macedonian"],
  ["br", "Breton"],
  ["eu", "Basque"],
  ["is", "Icelandic"],
  ["hy", "Armenian"],
  ["ne", "Nepali"],
  ["mn", "Mongolian"],
  ["bs", "Bosnian"],
  ["kk", "Kazakh"],
  ["sq", "Albanian"],
  ["sw", "Swahili"],
  ["gl", "Galician"],
  ["mr", "Marathi"],
  ["pa", "Punjabi"],
  ["si", "Sinhala"],
  ["km", "Khmer"],
  ["sn", "Shona"],
  ["yo", "Yoruba"],
  ["so", "Somali"],
  ["af", "Afrikaans"],
  ["oc", "Occitan"],
  ["ka", "Georgian"],
  ["be", "Belarusian"],
  ["tg", "Tajik"],
  ["sd", "Sindhi"],
  ["gu", "Gujarati"],
  ["am", "Amharic"],
  ["yi", "Yiddish"],
  ["lo", "Lao"],
  ["uz", "Uzbek"],
  ["fo", "Faroese"],
  ["ht", "Haitian Creole"],
  ["ps", "Pashto"],
  ["tk", "Turkmen"],
  ["nn", "Nynorsk"],
  ["mt", "Maltese"],
  ["sa", "Sanskrit"],
  ["lb", "Luxembourgish"],
  ["my", "Myanmar"],
  ["bo", "Tibetan"],
  ["tl", "Tagalog"],
  ["mg", "Malagasy"],
  ["as", "Assamese"],
  ["tt", "Tatar"],
  ["haw", "Hawaiian"],
  ["ln", "Lingala"],
  ["ha", "Hausa"],
  ["ba", "Bashkir"],
  ["jw", "Javanese"],
  ["su", "Sundanese"],
  ["yue", "Cantonese"],
].map(([code, name]) => ({ code, name }));

/**
 * The whisper.cpp language to preselect: the best favorite language match,
 * then the fallback language (the Transcription Language preference), then auto.
 */
export function defaultWhisperLanguage(
  favoriteLanguages?: string,
  fallback?: string,
): string {
  const names = (language: { code: string; name: string }) => [
    language.code,
    language.name,
  ];
  return (
    rankFavorites(whisperLanguages, names, favoriteLanguages).favorites[0]
      ?.code ??
    rankFavorites(whisperLanguages, names, fallback).favorites[0]?.code ??
    "auto"
  );
}

export function whisperLanguageName(code: string): string {
  if (code === "auto") return "Detect Automatically";
  return (
    whisperLanguages.find((language) => language.code === code)?.name || code
  );
}

export function safeName(value: string): string {
  return (
    value
      .normalize("NFC")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f/\\:<>|?*]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 100) || "video"
  );
}

export function languageLabel(code: string): string {
  const original = /(?:[-_]|\s|\()(?:orig|original)\)?$/i.test(code);
  const base = code.replace(/(?:[-_]|\s|\()(?:orig|original)\)?$/i, "");
  try {
    const label =
      new Intl.DisplayNames(["en"], { type: "language" }).of(base) || base;
    return original ? `${label} (Original)` : label;
  } catch {
    return code;
  }
}

export function normalizeLanguage(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/(?:\s*\((?:orig|original)\)|[-_](?:orig|original))\s*$/i, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function favoriteLanguageTerms(value?: string): string[] {
  return (value || "")
    .split(/[,;\n]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** Fuzzy score from 0 to 100 for how well a typed language matches any of a language's names. */
export function languageScore(names: string[], term: string): number {
  const query = normalizeLanguage(term);
  if (!query) return 0;
  const candidates = names.map(normalizeLanguage);
  let score = 0;
  for (const candidate of candidates) {
    if (candidate === query) score = Math.max(score, 100);
    else if (candidate.startsWith(query) && query.length >= 3)
      score = Math.max(score, 80);
    else if (candidate.includes(query) && query.length >= 4)
      score = Math.max(score, 60);
    else {
      let offset = 0;
      let first = -1;
      let last = -1;
      for (const character of query) {
        const position = candidate.indexOf(character, offset);
        if (position < 0) {
          last = -1;
          break;
        }
        if (first < 0) first = position;
        last = position;
        offset = position + 1;
      }
      if (last >= 0 && query.length >= 4) {
        const gaps = last - first + 1 - query.length;
        score = Math.max(
          score,
          Math.max(1, 40 - gaps * 3 - first + (first === 0 ? 8 : 0)),
        );
      }
    }
  }
  return score;
}

export function favoriteScore(caption: Caption, term: string): number {
  return languageScore(
    [caption.language, languageLabel(caption.language)],
    term,
  );
}

/**
 * Items matching the favorite languages, in the order the favorites were
 * written and best match first. When nothing matches well, up to five close
 * matches are returned as suggestions instead. Ties keep the items' order.
 */
export function rankFavorites<T>(
  items: T[],
  names: (item: T) => string[],
  favoriteLanguages?: string,
): { favorites: T[]; suggestions: T[] } {
  const terms = favoriteLanguageTerms(favoriteLanguages);
  const ranked = items.map((item) => {
    let score = 0;
    let term = terms.length;
    terms.forEach((value, index) => {
      const match = languageScore(names(item), value);
      if (match > score) {
        score = match;
        term = index;
      }
    });
    return { item, score, term };
  });
  const favorites = ranked
    .filter((entry) => entry.score >= 60)
    .sort((a, b) => a.term - b.term || b.score - a.score)
    .map((entry) => entry.item);
  const suggestions = favorites.length
    ? []
    : ranked
        .filter((entry) => entry.score >= 30)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((entry) => entry.item);
  return { favorites, suggestions };
}

export function parseVideo(data: unknown, url: string): Video {
  if (!data || typeof data !== "object")
    throw new Error("yt-dlp did not return video details.");
  const info = data as Record<string, unknown>;
  if (typeof info.id !== "string" || typeof info.title !== "string")
    throw new Error("yt-dlp did not return a video title and ID.");
  const captions: Caption[] = [];
  for (const [field, kind] of [
    ["subtitles", "manual"],
    ["automatic_captions", "automatic"],
  ] as const) {
    const group = info[field];
    if (!group || typeof group !== "object") continue;
    for (const [language, entries] of Object.entries(group)) {
      if (
        language === "live_chat" ||
        !Array.isArray(entries) ||
        entries.length === 0
      )
        continue;
      const formats = [
        ...new Set(
          entries
            .map((entry) =>
              entry && typeof entry === "object" && "ext" in entry
                ? String(entry.ext)
                : "",
            )
            .filter(Boolean),
        ),
      ];
      if (formats.length) captions.push({ language, kind, formats });
    }
  }
  captions.sort(
    (a, b) =>
      a.language.localeCompare(b.language) || a.kind.localeCompare(b.kind),
  );
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const thumbnail = text(info.thumbnail);
  const uploadDate = text(info.upload_date);
  return {
    id: info.id,
    title: info.title,
    url,
    captions,
    thumbnail:
      thumbnail && /^https?:\/\//i.test(thumbnail) ? thumbnail : undefined,
    channel: text(info.channel) || text(info.uploader),
    duration:
      typeof info.duration === "number" && info.duration >= 0
        ? info.duration
        : undefined,
    uploadDate:
      uploadDate && /^\d{8}$/.test(uploadDate)
        ? `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6)}`
        : undefined,
  };
}

export function youtubeThumbnail(input: string): string | undefined {
  return isYoutubeUrl(input)
    ? `https://i.ytimg.com/vi/${youtubeId(input)}/mqdefault.jpg`
    : undefined;
}

/** Fetches the title and channel quickly from YouTube oEmbed while yt-dlp inspects the video. */
export async function fetchPreview(
  input: string,
  signal?: AbortSignal,
): Promise<VideoPreview> {
  if (!isYoutubeUrl(input)) return {};
  const response = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeUrl(input))}`,
    { signal },
  );
  if (!response.ok) return {};
  const data = (await response.json()) as Record<string, unknown>;
  return {
    title: typeof data.title === "string" ? data.title : undefined,
    channel:
      typeof data.author_name === "string" ? data.author_name : undefined,
  };
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60];
  const rest = String(total % 60).padStart(2, "0");
  return parts[0]
    ? `${parts[0]}:${String(parts[1]).padStart(2, "0")}:${rest}`
    : `${parts[1]}:${rest}`;
}

export async function executable(
  configured: string | undefined,
  name: string,
): Promise<string> {
  const candidates = configured
    ? [configured]
    : [
        ...(process.env.PATH || "")
          .split(":")
          .filter(Boolean)
          .map((dir) => join(dir, name)),
        join("/opt/homebrew/bin", name),
        join("/usr/local/bin", name),
        ...(name === "whisper-cli"
          ? [join(homedir(), "GitHub", "whisper.cpp", "build", "bin", name)]
          : []),
      ];
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      /* try next path */
    }
  }
  throw new Error(
    `${name} was not found. Install it or set its path in extension preferences.`,
  );
}

export async function run(
  bin: string,
  args: string[],
  onProgress?: (line: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return await new Promise((done, fail) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, signal });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 20_000_000) child.kill();
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-12_000);
      const lines = chunk.split(/[\r\n]+/).filter(Boolean);
      for (const line of lines) onProgress?.(line);
    });
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? done(stdout)
        : fail(
            new Error(
              `${basename(bin)} failed${code === null ? "" : ` (${code})`}: ${stderr.trim() || "No details available"}`,
            ),
          ),
    );
  });
}

/**
 * Options passed to every yt-dlp run. yt-dlp is given ffmpeg's path because
 * Raycast's PATH usually doesn't include Homebrew, and subtitle conversion
 * fails without it.
 */
async function ytDlpOptions(settings: Settings): Promise<string[]> {
  const options = ["--no-warnings"];
  try {
    options.push(
      "--ffmpeg-location",
      await executable(settings.ffmpegPath, "ffmpeg"),
    );
  } catch {
    /* yt-dlp reports a missing ffmpeg when a conversion needs it */
  }
  return options;
}

/** Reads video details with yt-dlp; YouTube links are normalized to a single watch URL. */
export async function inspectMedia(
  urlInput: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<Video> {
  const url = mediaUrl(urlInput);
  const bin = await executable(settings.ytDlpPath, "yt-dlp");
  const output = await run(
    bin,
    [
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      url,
    ],
    undefined,
    signal,
  );
  return parseVideo(JSON.parse(output), url);
}

function cueTexts(input: string): string[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const timing = /^\d\d:\d\d(?::\d\d)?[.,]\d+\s*-->/;
  const cues: string[] = [];
  let current: string[] | undefined;
  const flush = () => {
    if (current?.length) cues.push(current.join(" "));
    current = undefined;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (timing.test(line)) {
      flush();
      current = [];
      continue;
    }
    if (!current || !line) continue;
    let next = index + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (
      /^\d+$/.test(line) &&
      next < lines.length &&
      timing.test(lines[next].trim())
    )
      continue; // SRT cue number
    current.push(line);
  }
  flush();
  return cues;
}

function readableCue(cue: string): string {
  return cue
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rawCaptionText(input: string, sourceFormat: string): string {
  if (sourceFormat === "json3") {
    const data = JSON.parse(input) as {
      events?: { segs?: { utf8?: string }[] }[];
    };
    const lines = (data.events || [])
      .map((event) =>
        (event.segs || [])
          .map((segment) => segment.utf8 || "")
          .join("")
          .trim(),
      )
      .filter(Boolean);
    return lines.join("\n") + (lines.length ? "\n" : "");
  }
  const lines = cueTexts(input).map(readableCue).filter(Boolean);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function vttToText(input: string): string {
  const result: string[] = [];
  let previous: string[] = [];
  for (const cue of cueTexts(input)) {
    const text = readableCue(cue);
    if (!text) continue;
    const words = text.split(" ");
    let overlap = 0;
    for (let size = Math.min(previous.length, words.length); size > 0; size--) {
      if (
        previous.slice(-size).join(" ").toLocaleLowerCase() ===
        words.slice(0, size).join(" ").toLocaleLowerCase()
      ) {
        overlap = size;
        break;
      }
    }
    if (overlap === 1 && previous.length > 1 && words[0].length < 4)
      overlap = 0;
    const addition = words.slice(overlap).join(" ");
    if (addition) result.push(addition);
    previous = words;
  }
  return result.join("\n") + (result.length ? "\n" : "");
}

export function cleanSrt(input: string): string {
  const lines = input.replace(/\r/g, "").split("\n");
  const timing = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;
  const cues: { start: string; end: string; text: string[] }[] = [];
  let current: { start: string; end: string; text: string[] } | undefined;
  const flush = () => {
    if (current?.text.length) cues.push(current);
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const match = timing.exec(line);
    if (match) {
      flush();
      current = { start: match[1], end: match[2], text: [] };
      continue;
    }
    if (!current || !line) continue;
    if (/^\d+$/.test(line) && timing.test(lines[index + 1]?.trim() || ""))
      continue;
    current.text.push(line);
  }
  flush();
  return (
    cues
      .map(
        (cue, index) =>
          `${index + 1}\n${cue.start} --> ${cue.end}\n${cue.text.join("\n")}`,
      )
      .join("\n\n") + (cues.length ? "\n" : "")
  );
}

async function outputDirectory(settings: Settings): Promise<string> {
  const dir = resolve(
    (settings.downloadDirectory || join(homedir(), "Downloads")).replace(
      /^~(?=\/|$)/,
      homedir(),
    ),
  );
  if (!(await stat(dir)).isDirectory())
    throw new Error(
      "The download folder does not exist. Choose another folder in extension preferences.",
    );
  await access(dir, constants.W_OK);
  return dir;
}

async function uniquePath(
  directory: string,
  stem: string,
  extension: string,
): Promise<string> {
  return `${await uniqueBase(directory, stem, [extension])}.${extension}`;
}

async function uniqueBase(
  directory: string,
  stem: string,
  extensions: string[],
): Promise<string> {
  for (let index = 0; index < 1000; index++) {
    const base = join(directory, `${stem}${index ? ` (${index + 1})` : ""}`);
    const exists = await Promise.all(
      extensions.map(async (extension) => {
        try {
          await access(`${base}.${extension}`);
          return true;
        } catch {
          return false;
        }
      }),
    );
    if (exists.every((value) => !value)) return base;
  }
  throw new Error("Too many files with the same name in the download folder.");
}

export async function downloadCaption(
  video: Video,
  caption: Caption,
  format: ExportFormat,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string> {
  const bin = await executable(settings.ytDlpPath, "yt-dlp");
  const destination = await outputDirectory(settings);
  const temporary = await mkdtemp(join(tmpdir(), "raycast-captions-"));
  try {
    const preferred =
      format === "raw"
        ? caption.formats.includes("vtt")
          ? "vtt"
          : caption.formats.includes("srt")
            ? "srt"
            : caption.formats.includes("json3")
              ? "json3"
              : caption.formats[0]
        : format === "srt" && caption.formats.includes("srt")
          ? "srt"
          : caption.formats.includes("vtt")
            ? "vtt"
            : caption.formats.includes("srt")
              ? "srt"
              : caption.formats[0];
    const langPattern = `^${caption.language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
    const args = [
      ...(await ytDlpOptions(settings)),
      "--no-playlist",
      "--skip-download",
      "--sub-langs",
      langPattern,
      "--sub-format",
      preferred,
      "-o",
      join(temporary, "caption.%(ext)s"),
      caption.kind === "manual" ? "--write-subs" : "--write-auto-subs",
    ];
    if ((format === "srt" || format === "vtt") && preferred !== format)
      args.push("--convert-subs", format);
    if (format === "txt" && preferred !== "vtt")
      args.push("--convert-subs", "vtt");
    args.push(video.url);
    try {
      await run(bin, args);
    } catch (error) {
      if (
        caption.kind !== "automatic" ||
        !(error instanceof Error) ||
        !error.message.includes("HTTP Error 429")
      )
        throw error;
      onProgress?.(
        "YouTube rate limited this caption. Retrying after 60 seconds…",
      );
      await run(bin, [
        ...args.slice(0, -1),
        "--sleep-subtitles",
        "60",
        video.url,
      ]);
    }
    const files = (await readdir(temporary)).filter(
      (file) => !file.endsWith(".part"),
    );
    const extension =
      format === "raw" ? preferred : format === "txt" ? "vtt" : format;
    const source = files.find((file) => file.endsWith(`.${extension}`));
    if (!source)
      throw new Error(
        `yt-dlp did not produce a ${extension.toUpperCase()} file for ${caption.language}.`,
      );
    const stem = `${safeName(video.title)} [${video.id}] - ${safeName(caption.language)}${caption.kind === "automatic" ? " - auto" : ""}${format === "raw" ? " - RAW" : ""}`;
    const target = await uniquePath(
      destination,
      stem,
      format === "raw" ? "txt" : format,
    );
    if (format === "raw")
      await writeFile(
        target,
        rawCaptionText(
          await readFile(join(temporary, source), "utf8"),
          extension,
        ),
        { encoding: "utf8", flag: "wx" },
      );
    else if (format === "txt")
      await writeFile(
        target,
        vttToText(await readFile(join(temporary, source), "utf8")),
        { encoding: "utf8", flag: "wx" },
      );
    else if (format === "srt")
      await writeFile(
        target,
        cleanSrt(await readFile(join(temporary, source), "utf8")),
        { encoding: "utf8", flag: "wx" },
      );
    else
      await copyFile(join(temporary, source), target, constants.COPYFILE_EXCL);
    return target;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function downloadMedia(
  video: Video,
  format: MediaFormat,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string> {
  const ytDlp = await executable(settings.ytDlpPath, "yt-dlp");
  const ffmpeg = await executable(settings.ffmpegPath, "ffmpeg");
  const destination = await outputDirectory(settings);
  const temporary = await mkdtemp(join(tmpdir(), "raycast-media-"));
  try {
    const output = join(temporary, "media.%(ext)s");
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--ffmpeg-location",
      ffmpeg,
      "-o",
      output,
    ];
    if (format === "mp4") {
      args.push(
        "-f",
        "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "--recode-video",
        "mp4",
      );
    } else {
      args.push(
        "-f",
        "bestaudio/best",
        "--extract-audio",
        "--audio-format",
        format,
      );
      if (format === "mp3") args.push("--audio-quality", "0");
    }
    args.push(video.url);
    onProgress?.(`Downloading ${format.toUpperCase()}…`);
    await run(ytDlp, args, onProgress);
    const file = (await readdir(temporary)).find((name) =>
      name.endsWith(`.${format}`),
    );
    if (!file)
      throw new Error(`yt-dlp did not produce a ${format.toUpperCase()} file.`);
    const target = await uniquePath(
      destination,
      `${safeName(video.title)} [${video.id}]`,
      format,
    );
    await copyFile(join(temporary, file), target, constants.COPYFILE_EXCL);
    return target;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Whether a WAV header already describes the 16 kHz mono 16-bit PCM audio whisper.cpp reads. */
export function isWhisperWavHeader(header: Buffer): boolean {
  if (
    header.length < 12 ||
    header.toString("ascii", 0, 4) !== "RIFF" ||
    header.toString("ascii", 8, 12) !== "WAVE"
  )
    return false;
  for (let offset = 12; offset + 8 <= header.length;) {
    const size = header.readUInt32LE(offset + 4);
    if (header.toString("ascii", offset, offset + 4) === "fmt ")
      return (
        offset + 24 <= header.length &&
        header.readUInt16LE(offset + 8) === 1 &&
        header.readUInt16LE(offset + 10) === 1 &&
        header.readUInt32LE(offset + 12) === 16000 &&
        header.readUInt16LE(offset + 22) === 16
      );
    offset += 8 + size + (size % 2);
  }
  return false;
}

async function isWhisperWav(path: string): Promise<boolean> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    return isWhisperWavHeader(header.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}

async function whisperSetup(
  settings: Settings,
): Promise<{ whisper: string; model: string }> {
  const whisper = await executable(settings.whisperPath, "whisper-cli");
  const model =
    settings.modelPath ||
    join(
      dirname(dirname(dirname(whisper))),
      "models",
      "ggml-large-v3-turbo.bin",
    );
  if (!model || basename(model) !== "ggml-large-v3-turbo.bin")
    throw new Error(
      "Set the path to ggml-large-v3-turbo.bin in extension preferences.",
    );
  try {
    await access(model, constants.R_OK);
  } catch {
    throw new Error(
      "ggml-large-v3-turbo.bin was not found. Select the model file in extension preferences.",
    );
  }
  return { whisper, model };
}

/**
 * Returns a 16 kHz mono 16-bit WAV for whisper.cpp. Audio that is already in
 * that format is used as is; anything else is converted with ffmpeg, reading
 * only the first audio track.
 */
async function whisperAudio(
  input: string,
  temporary: string,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string> {
  if (await isWhisperWav(input)) return input;
  const ffmpeg = await executable(settings.ffmpegPath, "ffmpeg");
  const wav = join(temporary, "audio.wav");
  onProgress?.("Converting audio to 16 kHz WAV…");
  try {
    await run(ffmpeg, [
      "-nostdin",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
  } catch (error) {
    if (error instanceof Error && /matches no streams/.test(error.message))
      throw new Error("This file has no audio track.");
    throw error;
  }
  return wav;
}

/** Runs whisper-cli and returns the path the outputs were written to, without extension. */
async function runWhisper(
  { whisper, model }: { whisper: string; model: string },
  wav: string,
  language: string,
  outputs: string[],
  temporary: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const result = join(temporary, "result");
  onProgress?.("Transcribing with large-v3-turbo…");
  await run(
    whisper,
    [
      "-m",
      model,
      "-f",
      wav,
      "-l",
      language,
      "--print-progress",
      ...outputs.map((extension) => `--output-${extension}`),
      "-of",
      result,
    ],
    (line) => {
      const match = /progress\s*=\s*(\d+)%/.exec(line);
      if (match) onProgress?.(`Transcribing… ${match[1]}%`);
    },
  );
  return result;
}

/**
 * Transcribes a local audio or video file with whisper.cpp and saves one file
 * in the chosen format next to it, or in the download folder when that folder
 * is not writable.
 */
export async function transcribeFile(
  path: string,
  language: string,
  format: ExportFormat,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string> {
  if (!localFileInfo(path)?.isFile)
    throw new Error(`${path} is not a file that can be read.`);
  const setup = await whisperSetup(settings);
  const temporary = await mkdtemp(join(tmpdir(), "raycast-whisper-"));
  try {
    const wav = await whisperAudio(path, temporary, settings, onProgress);
    const source = format === "srt" ? "srt" : "vtt";
    const result = await runWhisper(
      setup,
      wav,
      language,
      [source],
      temporary,
      onProgress,
    );
    const output = await readFile(`${result}.${source}`, "utf8");
    let destination = dirname(path);
    try {
      await access(destination, constants.W_OK);
    } catch {
      destination = await outputDirectory(settings);
    }
    const target = await uniquePath(
      destination,
      `${safeName(parse(path).name)} - whisper-${language === "auto" ? "auto" : safeName(whisperLanguageName(language))}${format === "raw" ? " - RAW" : ""}`,
      format === "raw" ? "txt" : format,
    );
    await writeFile(
      target,
      format === "raw"
        ? rawCaptionText(output, "vtt")
        : format === "txt"
          ? vttToText(output)
          : format === "srt"
            ? cleanSrt(output)
            : output,
      { encoding: "utf8", flag: "wx" },
    );
    return target;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function transcribe(
  video: Video,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string[]> {
  if (video.captions.length)
    throw new Error(
      "This video has captions. Choose an available caption track to download.",
    );
  const setup = await whisperSetup(settings);
  const ytDlp = await executable(settings.ytDlpPath, "yt-dlp");
  const destination = await outputDirectory(settings);
  const temporary = await mkdtemp(join(tmpdir(), "raycast-whisper-"));
  try {
    onProgress?.("Downloading audio…");
    await run(ytDlp, [
      "--no-playlist",
      "--no-warnings",
      "-f",
      "bestaudio/best",
      "-o",
      join(temporary, "audio.%(ext)s"),
      video.url,
    ]);
    const audio = (await readdir(temporary)).find(
      (name) => name.startsWith("audio.") && !name.endsWith(".part"),
    );
    if (!audio) throw new Error("yt-dlp did not produce an audio file.");
    const wav = await whisperAudio(
      join(temporary, audio),
      temporary,
      settings,
      onProgress,
    );
    const stem = `${safeName(video.title)} [${video.id}] - whisper-${safeName(settings.whisperLanguage || "Serbian")}`;
    const outputBase = await uniqueBase(destination, stem, [
      "srt",
      "vtt",
      "txt",
    ]);
    const result = await runWhisper(
      setup,
      wav,
      settings.whisperLanguage?.trim() || "Serbian",
      ["srt", "vtt", "txt"],
      temporary,
      onProgress,
    );
    const paths: string[] = [];
    for (const extension of ["srt", "vtt", "txt"]) {
      const source = `${result}.${extension}`;
      await access(source, constants.R_OK);
      const target = `${outputBase}.${extension}`;
      await copyFile(source, target, constants.COPYFILE_EXCL);
      paths.push(target);
    }
    return paths;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
