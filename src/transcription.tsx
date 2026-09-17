import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LocalStorage,
  Toast,
  showInFinder,
  showToast,
} from "@raycast/api";
import { basename } from "node:path";
import { useEffect, useMemo, useState } from "react";
import {
  ExportFormat,
  Settings,
  formatSize,
  mediaFiles,
  rankFavorites,
  whisperLanguageName,
  whisperLanguages,
} from "./core";
import {
  TranscriptionOptions,
  WhisperModel,
  canTranslate,
  modelName,
  transcribeFile,
  whisperModels,
} from "./whisper";
import { errorMessage } from "./video";

export const captionFormats: { value: ExportFormat; title: string }[] = [
  { value: "raw", title: "RAW · TXT (all cues)" },
  { value: "txt", title: "Clean TXT" },
  { value: "srt", title: "SRT" },
  { value: "vtt", title: "VTT" },
];

export function formatTitle(format: ExportFormat): string {
  return (
    captionFormats.find((item) => item.value === format)?.title ||
    format.toUpperCase()
  );
}

/** Favorite languages saved with Edit Favorite Languages, starting from the preference. */
export function useFavoriteLanguages(settings: Settings) {
  const [value, setValue] = useState(settings.favoriteLanguages ?? "");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    LocalStorage.getItem<string>("favoriteLanguages")
      .then(
        (stored) => stored !== undefined && setValue(stored),
        () => undefined,
      )
      .finally(() => setLoaded(true));
  }, []);

  return {
    value,
    loaded,
    save(next: string) {
      setValue(next);
      LocalStorage.setItem("favoriteLanguages", next);
    },
  };
}

/** Installed whisper models, with the default model first. */
export function useWhisperModels(settings: Settings) {
  const [state, setState] = useState<{
    models: WhisperModel[];
    defaultModel?: string;
    loaded: boolean;
  }>({ models: [], loaded: false });

  useEffect(() => {
    whisperModels(settings).then(
      (value) => setState({ ...value, loaded: true }),
      () => setState({ models: [], loaded: true }),
    );
  }, []);

  return state;
}

/**
 * Transcribes files one after another, keeping a single toast up to date.
 * Returns the saved files; a failed file does not stop the rest.
 */
export async function transcribeWithToast(
  paths: string[],
  options: TranscriptionOptions,
  settings: Settings,
  onProgress?: (path: string, message: string) => void,
): Promise<string[]> {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title:
      paths.length > 1
        ? `Transcribing ${paths.length} files…`
        : `Transcribing ${basename(paths[0])}…`,
  });
  const outputs: string[] = [];
  const failures: string[] = [];
  for (const [index, path] of paths.entries()) {
    const prefix = paths.length > 1 ? `${index + 1} of ${paths.length} · ` : "";
    onProgress?.(path, "Preparing transcription…");
    try {
      outputs.push(
        await transcribeFile(path, options, settings, (message) => {
          toast.title = `${prefix}${message}`;
          onProgress?.(path, message);
        }),
      );
    } catch (error) {
      failures.push(`${basename(path)}: ${errorMessage(error)}`);
    }
  }
  if (failures.length) {
    toast.style = Toast.Style.Failure;
    toast.title = outputs.length
      ? `${outputs.length} of ${paths.length} transcriptions saved`
      : "Transcription failed";
    toast.message = failures.join("\n");
  } else {
    toast.style = Toast.Style.Success;
    toast.title =
      outputs.length > 1
        ? `${outputs.length} transcriptions saved`
        : "Transcription saved";
    toast.message = outputs.join("\n");
  }
  const last = outputs[outputs.length - 1];
  if (last)
    toast.primaryAction = {
      title: "Show in Finder",
      onAction: () => showInFinder(last),
    };
  return outputs;
}

/** Files, spoken language, output format and model; ⌘↵ submits. */
export function TranscribeForm({
  initialPaths,
  settings,
  favoriteLanguages,
  defaultLanguage,
  isLoading,
  note,
  onTranscribe,
}: {
  initialPaths: string[];
  settings: Settings;
  favoriteLanguages: string;
  defaultLanguage: string;
  isLoading?: boolean;
  note?: string;
  onTranscribe: (paths: string[], options: TranscriptionOptions) => void;
}) {
  const [paths, setPaths] = useState(initialPaths);
  const [filesError, setFilesError] = useState<string>();
  const [modelError, setModelError] = useState<string>();
  const [translateError, setTranslateError] = useState<string>();
  const models = useWhisperModels(settings);
  const names = (language: { code: string; name: string }) => [
    language.code,
    language.name,
  ];
  const { favorites, suggestions } = rankFavorites(
    whisperLanguages,
    names,
    favoriteLanguages,
  );
  const featured = new Set([...favorites, ...suggestions]);
  const languageItem = (language: { code: string; name: string }) => (
    <Form.Dropdown.Item
      key={language.code}
      value={language.code}
      title={language.name}
      keywords={[language.code]}
    />
  );

  const files = useMemo(() => mediaFiles(paths), [paths]);

  if (!models.loaded) return <Form isLoading />;

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={
        files.length === 1 ? `Transcribe ${basename(files[0])}` : "Transcribe"
      }
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Transcribe"
            icon={Icon.Microphone}
            onSubmit={(values: {
              language: string;
              format: ExportFormat;
              model?: string;
              translate: boolean;
            }) => {
              if (isLoading) return;
              if (!files.length) {
                setFilesError(
                  "Choose audio or video files, or a folder that contains some",
                );
                return;
              }
              const model = models.models.find(
                (item) => item.path === values.model,
              );
              if (model?.missingEncoder) {
                setModelError(
                  `whisper.cpp uses Core ML and needs ${model.missingEncoder} for this model`,
                );
                return;
              }
              if (values.translate && model && !canTranslate(model.path)) {
                setTranslateError(
                  `${modelName(model.path)} can't translate. Choose a model without “turbo”.`,
                );
                return;
              }
              onTranscribe(files, {
                language: values.language,
                format: values.format,
                model: model?.path,
                translate: values.translate,
              });
            }}
          />
        </ActionPanel>
      }
    >
      {note && <Form.Description text={note} />}
      <Form.FilePicker
        id="files"
        title="Files"
        value={paths}
        onChange={(value) => {
          setPaths(value);
          setFilesError(undefined);
        }}
        canChooseDirectories
        allowMultipleSelection
        error={filesError}
        info="Folders are searched, including subfolders, for audio and video files."
      />
      {files.length !== paths.length && (
        <Form.Description
          text={
            files.length === 1
              ? "1 audio or video file will be transcribed."
              : `${files.length} audio and video files will be transcribed, one after another.`
          }
        />
      )}
      <Form.Dropdown
        id="language"
        title="Spoken Language"
        defaultValue={defaultLanguage}
        info="Your favorite languages are listed first."
      >
        {favorites.length > 0 && (
          <Form.Dropdown.Section title="Favorite Languages">
            {favorites.map(languageItem)}
          </Form.Dropdown.Section>
        )}
        {suggestions.length > 0 && (
          <Form.Dropdown.Section title="Suggested Languages">
            {suggestions.map(languageItem)}
          </Form.Dropdown.Section>
        )}
        <Form.Dropdown.Section title="All Languages">
          <Form.Dropdown.Item
            value="auto"
            title={whisperLanguageName("auto")}
            icon={Icon.Wand}
          />
          {whisperLanguages
            .filter((language) => !featured.has(language))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(languageItem)}
        </Form.Dropdown.Section>
      </Form.Dropdown>
      <Form.Dropdown id="format" title="Output" defaultValue="raw">
        {captionFormats.map((format) => (
          <Form.Dropdown.Item
            key={format.value}
            value={format.value}
            title={format.title}
          />
        ))}
      </Form.Dropdown>
      {models.models.length > 0 ? (
        <Form.Dropdown
          id="model"
          title="Model"
          defaultValue={models.defaultModel}
          error={modelError}
          onChange={() => {
            setModelError(undefined);
            setTranslateError(undefined);
          }}
          info="large-v3 is the most accurate and the slowest. large-v3-turbo is much faster and nearly as accurate. Quantized models such as q5_0 are smaller and faster, and slightly less accurate."
        >
          {models.models.map((model) => (
            <Form.Dropdown.Item
              key={model.path}
              value={model.path}
              title={modelTitle(model)}
            />
          ))}
        </Form.Dropdown>
      ) : (
        <Form.Description
          title="Model"
          text="No whisper model was found. Select ggml-large-v3-turbo.bin in extension preferences."
        />
      )}
      <Form.Checkbox
        id="translate"
        title="Translation"
        label="Translate to English"
        defaultValue={false}
        error={translateError}
        onChange={() => setTranslateError(undefined)}
        info="Whisper writes the English translation instead of the spoken language. Turbo models can't translate; use large-v3 or medium."
      />
      <Form.Description text="⌘↵ converts the audio to 16 kHz WAV with ffmpeg and transcribes it with whisper.cpp. Each result is saved next to its file." />
    </Form>
  );
}

function modelTitle(model: WhisperModel): string {
  return [
    modelName(model.path),
    formatSize(model.size),
    model.missingEncoder && "needs Core ML encoder",
  ]
    .filter(Boolean)
    .join(" · ");
}
