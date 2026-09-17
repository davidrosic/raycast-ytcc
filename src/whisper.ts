import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants, existsSync, realpathSync } from "node:fs";
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

type WhisperSetup = { whisper: string; model: string; vad?: string };

/** Silero VAD v6.2.0 converted for whisper.cpp, from the ggml-org Hugging Face repository. */
export const sileroModel = {
  name: "ggml-silero-v6.2.0.bin",
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin",
  sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
};

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The Silero VAD model: the one set in preferences, one next to the whisper
 * model, or a copy downloaded once into the extension's support folder.
 */
async function vadModel(
  settings: Settings,
  model: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  if (settings.vadModelPath) {
    if (await readable(settings.vadModelPath)) return settings.vadModelPath;
    throw new Error(
      "The Silero VAD model was not found. Select it again in extension preferences.",
    );
  }
  const beside = join(dirname(model), sileroModel.name);
  if (await readable(beside)) return beside;
  if (!settings.supportPath)
    throw new Error("Select a Silero VAD model in extension preferences.");
  const folder = join(settings.supportPath, "models");
  const downloaded = join(folder, sileroModel.name);
  if (await readable(downloaded)) return downloaded;
  onProgress?.("Downloading Silero VAD model…");
  let data: Buffer;
  try {
    const response = await fetch(sileroModel.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(
      `Could not download the Silero VAD model (${error instanceof Error ? error.message : String(error)}). Check your connection, or turn off Skip Silence in extension preferences.`,
    );
  }
  if (createHash("sha256").update(data).digest("hex") !== sileroModel.sha256)
    throw new Error(
      "The downloaded Silero VAD model was damaged. Try again later.",
    );
  await mkdir(folder, { recursive: true });
  const partial = `${downloaded}.${process.pid}.part`;
  await writeFile(partial, data);
  await rename(partial, downloaded);
  return downloaded;
}

export type WhisperModel = {
  path: string;
  /** The file name without `ggml-` and `.bin`, for example `large-v3-turbo-q5_0`. */
  name: string;
  size: number;
  /** The Core ML encoder this model still needs, when whisper.cpp was built with Core ML. */
  missingEncoder?: string;
};

export function modelName(path: string): string {
  return basename(path)
    .replace(/^ggml-/, "")
    .replace(/\.bin$/, "");
}

/** The models folder of a whisper.cpp checkout, from its `build/bin/whisper-cli`. */
function checkoutModels(whisper: string): string {
  return join(dirname(dirname(dirname(whisper))), "models");
}

function defaultModelPath(settings: Settings, whisper: string): string {
  return (
    settings.modelPath ||
    join(checkoutModels(whisper), "ggml-large-v3-turbo.bin")
  );
}

/** The Core ML encoder whisper.cpp loads for a model; quantized models share their base model's encoder. */
export function coreMlEncoder(model: string): string {
  return `${model.replace(/\.[^./]*$/, "").replace(/-q\d_\d$/, "")}-encoder.mlmodelc`;
}

/** Whether whisper-cli was built with Core ML, which needs an encoder next to every model. */
function usesCoreMl(whisper: string): boolean {
  try {
    const bin = dirname(realpathSync(whisper));
    return [join(bin, "..", "src"), join(bin, "..", "lib"), bin].some(
      (folder) => existsSync(join(folder, "libwhisper.coreml.dylib")),
    );
  } catch {
    return false;
  }
}

/**
 * Whisper models next to the default model, in the whisper.cpp checkout, and in
 * the extension's support folder. The default model comes first, then larger
 * (more accurate) models before smaller ones.
 */
export async function whisperModels(
  settings: Settings,
): Promise<{ models: WhisperModel[]; defaultModel?: string }> {
  let whisper: string | undefined;
  try {
    whisper = await executable(settings.whisperPath, "whisper-cli");
  } catch {
    return { models: [] };
  }
  const defaultModel = defaultModelPath(settings, whisper);
  const coreMl = usesCoreMl(whisper);
  const folders = [
    dirname(defaultModel),
    checkoutModels(whisper),
    ...(settings.supportPath ? [join(settings.supportPath, "models")] : []),
  ];
  const paths = new Set<string>();
  if (localFileInfo(defaultModel)?.isFile) paths.add(defaultModel);
  for (const folder of new Set(folders)) {
    try {
      for (const file of await readdir(folder))
        if (/^ggml-.+\.bin$/i.test(file) && !/silero/i.test(file))
          paths.add(join(folder, file));
    } catch {
      /* missing folder */
    }
  }
  const models: WhisperModel[] = [];
  for (const path of paths) {
    const info = localFileInfo(path);
    if (!info?.isFile) continue;
    const encoder = coreMlEncoder(path);
    models.push({
      path,
      name: modelName(path),
      size: info.size,
      missingEncoder:
        coreMl && !existsSync(encoder) ? basename(encoder) : undefined,
    });
  }
  models.sort(
    (a, b) =>
      Number(b.path === defaultModel) - Number(a.path === defaultModel) ||
      b.size - a.size,
  );
  return {
    models,
    defaultModel: paths.has(defaultModel) ? defaultModel : models[0]?.path,
  };
}

async function whisperSetup(
  settings: Settings,
  chosenModel?: string,
  onProgress?: (message: string) => void,
): Promise<WhisperSetup> {
  const whisper = await executable(settings.whisperPath, "whisper-cli");
  const model = chosenModel || defaultModelPath(settings, whisper);
  if (!(await readable(model)))
    throw new Error(
      chosenModel || settings.modelPath
        ? `${basename(model)} was not found. Choose another model, or select one in extension preferences.`
        : "No whisper model was found. Select ggml-large-v3-turbo.bin in extension preferences.",
    );
  return {
    whisper,
    model,
    vad:
      settings.skipSilence === false
        ? undefined
        : await vadModel(settings, model, onProgress),
  };
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
  { whisper, model, vad }: WhisperSetup,
  wav: string,
  language: string,
  outputs: string[],
  temporary: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const result = join(temporary, "result");
  onProgress?.(`Transcribing with ${modelName(model)}…`);
  try {
    await run(
      whisper,
      [
        "-m",
        model,
        "-f",
        wav,
        "-l",
        language,
        ...(vad ? ["--vad", "--vad-model", vad] : []),
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
  } catch (error) {
    const coreMl =
      error instanceof Error &&
      /failed to load Core ML model from '([^']+)'/.exec(error.message);
    if (coreMl)
      throw new Error(
        `This whisper.cpp build uses Core ML, and ${modelName(model)} has no Core ML encoder (${basename(coreMl[1])}). Create it with ./models/generate-coreml-model.sh ${modelName(model).replace(/-q\d_\d$/, "")} in whisper.cpp, or choose another model.`,
      );
    if (
      vad &&
      error instanceof Error &&
      /unknown argument: --vad|failed to (initialize|open|compute) VAD/i.test(
        error.message,
      )
    )
      throw new Error(
        "whisper.cpp couldn't run Silero VAD. Update whisper.cpp, or turn off Skip Silence in extension preferences.",
      );
    throw error;
  }
  return result;
}

/**
 * Transcribes a local audio or video file with whisper.cpp and saves one file
 * in the chosen format next to it, or in the download folder when that folder
 * is not writable.
 */
export type TranscriptionOptions = {
  /** A whisper.cpp language code, or `auto`. */
  language: string;
  format: ExportFormat;
  /** The model file; the default model when not set. */
  model?: string;
};

export async function transcribeFile(
  path: string,
  { language, format, model }: TranscriptionOptions,
  settings: Settings,
  onProgress?: (message: string) => void,
): Promise<string> {
  if (!localFileInfo(path)?.isFile)
    throw new Error(`${path} is not a file that can be read.`);
  const setup = await whisperSetup(settings, model, onProgress);
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
  const setup = await whisperSetup(settings, undefined, onProgress);
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
