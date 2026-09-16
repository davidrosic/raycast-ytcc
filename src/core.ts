import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

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
};
export type Settings = {
  downloadDirectory?: string;
  ytDlpPath?: string;
  ffmpegPath?: string;
  whisperPath?: string;
  modelPath?: string;
  whisperLanguage?: string;
};

export function youtubeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
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
  return `https://www.youtube.com/watch?v=${id}`;
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
  return { id: info.id, title: info.title, url, captions };
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
): Promise<string> {
  return await new Promise((done, fail) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true });
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
      if (lines.length) onProgress?.(lines[lines.length - 1]);
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

export async function inspect(
  urlInput: string,
  settings: Settings,
): Promise<Video> {
  const url = youtubeUrl(urlInput);
  const bin = await executable(settings.ytDlpPath, "yt-dlp");
  const output = await run(bin, [
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    url,
  ]);
  return parseVideo(JSON.parse(output), url);
}

export async function inspectMedia(
  urlInput: string,
  settings: Settings,
): Promise<Video> {
  let url: URL;
  try {
    url = new URL(urlInput.trim());
  } catch {
    throw new Error("Enter a valid video URL.");
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Enter an HTTP or HTTPS video URL.");
  const bin = await executable(settings.ytDlpPath, "yt-dlp");
  const output = await run(bin, [
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    url.toString(),
  ]);
  return parseVideo(JSON.parse(output), url.toString());
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
      "--no-playlist",
      "--skip-download",
      "--no-warnings",
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

export async function transcribe(
  video: Video,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string[]> {
  if (video.captions.length)
    throw new Error(
      "This video has captions. Choose an available caption track to download.",
    );
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
  const ytDlp = await executable(settings.ytDlpPath, "yt-dlp");
  const ffmpeg = await executable(settings.ffmpegPath, "ffmpeg");
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
    const wav = join(temporary, "audio.wav");
    onProgress?.("Converting audio to 16 kHz WAV…");
    await run(ffmpeg, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      join(temporary, audio),
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
    const stem = `${safeName(video.title)} [${video.id}] - whisper-${safeName(settings.whisperLanguage || "Serbian")}`;
    const outputBase = await uniqueBase(destination, stem, [
      "srt",
      "vtt",
      "txt",
    ]);
    onProgress?.("Transcribing with large-v3-turbo…");
    await run(
      whisper,
      [
        "-m",
        model,
        "-f",
        wav,
        "-l",
        settings.whisperLanguage?.trim() || "Serbian",
        "--output-srt",
        "--output-vtt",
        "--output-txt",
        "-of",
        join(temporary, "result"),
      ],
      onProgress,
    );
    const paths: string[] = [];
    for (const extension of ["srt", "vtt", "txt"]) {
      const source = join(temporary, `result.${extension}`);
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
