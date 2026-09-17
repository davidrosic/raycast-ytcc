import { createHash } from "node:crypto";
import {
  access,
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
  uniquePath,
  vttToText,
  whisperLanguageName,
  ytDlpOptions,
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
  signal?: AbortSignal,
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
    const response = await fetch(sileroModel.url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (signal?.aborted) throw error;
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
  signal?: AbortSignal,
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
        : await vadModel(settings, model, onProgress, signal),
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
  signal?: AbortSignal,
): Promise<string> {
  if (await isWhisperWav(input)) return input;
  const ffmpeg = await executable(settings.ffmpegPath, "ffmpeg");
  const wav = join(temporary, "audio.wav");
  onProgress?.("Converting audio to 16 kHz WAV…");
  try {
    await run(
      ffmpeg,
      [
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
      ],
      undefined,
      signal,
    );
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
  { language, translate }: Pick<TranscriptionOptions, "language" | "translate">,
  outputs: string[],
  temporary: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const result = join(temporary, "result");
  onProgress?.(
    `${translate ? "Translating" : "Transcribing"} with ${modelName(model)}…`,
  );
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
        ...(translate ? ["--translate"] : []),
        ...(vad ? ["--vad", "--vad-model", vad] : []),
        "--print-progress",
        ...outputs.map((extension) => `--output-${extension}`),
        "-of",
        result,
      ],
      (line) => {
        const match = /progress\s*=\s*(\d+)%/.exec(line);
        if (match)
          onProgress?.(
            `${translate ? "Translating" : "Transcribing"}… ${match[1]}%`,
          );
      },
      signal,
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

export type TranscriptionOptions = {
  /** A whisper.cpp language code, or `auto`. */
  language: string;
  format: ExportFormat;
  /** The model file; the default model when not set. */
  model?: string;
  /** Translate the speech to English instead of transcribing it. */
  translate?: boolean;
};

/** Turbo models were not trained to translate and answer in the spoken language instead. */
export function canTranslate(model: string): boolean {
  return !/turbo/i.test(modelName(model));
}

/** The end of a transcription's file name, for example `whisper-Serbian` or `whisper-Serbian to English`. */
export function transcriptSuffix(language: string, translate?: boolean) {
  const spoken =
    language === "auto" ? "auto" : safeName(whisperLanguageName(language));
  return `whisper-${spoken}${translate && language !== "en" ? " to English" : ""}`;
}

/**
 * Transcribes audio with whisper.cpp and saves one file in the chosen format.
 * `audio` returns the file to read, and may download it into the temporary folder.
 */
async function transcribeAudio(
  audio: (temporary: string) => Promise<string>,
  destination: () => Promise<{ directory: string; name: string }>,
  options: TranscriptionOptions,
  settings: Settings,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { language, format, model, translate } = options;
  const setup = await whisperSetup(settings, model, onProgress, signal);
  if (translate && !canTranslate(setup.model))
    throw new Error(
      `${modelName(setup.model)} can't translate. Choose large-v3 or another model without “turbo” in its name.`,
    );
  const temporary = await mkdtemp(join(tmpdir(), "raycast-whisper-"));
  try {
    const wav = await whisperAudio(
      await audio(temporary),
      temporary,
      settings,
      onProgress,
      signal,
    );
    const source = format === "srt" ? "srt" : "vtt";
    const result = await runWhisper(
      setup,
      wav,
      options,
      [source],
      temporary,
      onProgress,
      signal,
    );
    const output = await readFile(`${result}.${source}`, "utf8");
    const { directory, name } = await destination();
    const target = await uniquePath(
      directory,
      `${name} - ${transcriptSuffix(language, translate)}${format === "raw" ? " - RAW" : ""}`,
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

/**
 * Transcribes a local audio or video file and saves the result next to it, or
 * in the download folder when that folder is not writable.
 */
export async function transcribeFile(
  path: string,
  options: TranscriptionOptions,
  settings: Settings,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!localFileInfo(path)?.isFile)
    throw new Error(`${path} is not a file that can be read.`);
  return await transcribeAudio(
    async () => path,
    async () => {
      try {
        await access(dirname(path), constants.W_OK);
        return { directory: dirname(path), name: safeName(parse(path).name) };
      } catch {
        return {
          directory: await outputDirectory(settings),
          name: safeName(parse(path).name),
        };
      }
    },
    options,
    settings,
    onProgress,
    signal,
  );
}

/** Downloads a video's audio with yt-dlp, transcribes it, and saves the result in the download folder. */
export async function transcribeVideo(
  video: Pick<Video, "id" | "title" | "url">,
  options: TranscriptionOptions,
  settings: Settings,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const ytDlp = await executable(settings.ytDlpPath, "yt-dlp");
  const directory = await outputDirectory(settings);
  return await transcribeAudio(
    async (temporary) => {
      onProgress?.("Downloading audio…");
      await run(
        ytDlp,
        [
          ...(await ytDlpOptions(settings)),
          "--no-playlist",
          "--newline",
          "-f",
          "bestaudio/best",
          "-o",
          join(temporary, "audio.%(ext)s"),
          video.url,
        ],
        (line) => {
          const match = /\[download\]\s+([\d.]+)%/.exec(line);
          if (match)
            onProgress?.(`Downloading audio… ${Math.floor(Number(match[1]))}%`);
        },
        signal,
      );
      const audio = (await readdir(temporary)).find(
        (name) => name.startsWith("audio.") && !name.endsWith(".part"),
      );
      if (!audio) throw new Error("yt-dlp did not produce an audio file.");
      return join(temporary, audio);
    },
    async () => ({
      directory,
      name: `${safeName(video.title)} [${video.id}]`,
    }),
    options,
    settings,
    onProgress,
    signal,
  );
}
