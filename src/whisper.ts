import {
  access,
  copyFile,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse } from "node:path";
import {
  ExportFormat,
  Settings,
  Video,
  cleanSrt,
  executable,
  localFileInfo,
  outputDirectory,
  rawCaptionText,
  run,
  safeName,
  uniqueBase,
  uniquePath,
  vttToText,
  whisperLanguageName,
} from "./core";

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
