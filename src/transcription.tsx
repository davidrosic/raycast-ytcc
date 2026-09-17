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
import { useEffect, useState } from "react";
import {
  ExportFormat,
  Settings,
  localFileInfo,
  rankFavorites,
  whisperLanguageName,
  whisperLanguages,
} from "./core";
import { transcribeFile } from "./whisper";
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

/**
 * Transcribes files one after another, keeping a single toast up to date.
 * Returns the saved files; a failed file does not stop the rest.
 */
export async function transcribeWithToast(
  paths: string[],
  language: string,
  format: ExportFormat,
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
        await transcribeFile(path, language, format, settings, (message) => {
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

/** Files, spoken language and output format; ⌘↵ submits. */
export function TranscribeForm({
  initialPaths,
  favoriteLanguages,
  defaultLanguage,
  isLoading,
  note,
  onTranscribe,
}: {
  initialPaths: string[];
  favoriteLanguages: string;
  defaultLanguage: string;
  isLoading?: boolean;
  note?: string;
  onTranscribe: (
    paths: string[],
    language: string,
    format: ExportFormat,
  ) => void;
}) {
  const [paths, setPaths] = useState(initialPaths);
  const [filesError, setFilesError] = useState<string>();
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

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={
        paths.length === 1 ? `Transcribe ${basename(paths[0])}` : "Transcribe"
      }
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Transcribe"
            icon={Icon.Microphone}
            onSubmit={(values: { language: string; format: ExportFormat }) => {
              if (isLoading) return;
              const files = paths.filter((path) => localFileInfo(path)?.isFile);
              if (!files.length) {
                setFilesError("Choose at least one audio or video file");
                return;
              }
              onTranscribe(files, values.language, values.format);
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
        canChooseDirectories={false}
        allowMultipleSelection
        error={filesError}
      />
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
      <Form.Description text="⌘↵ converts the audio to 16 kHz WAV with ffmpeg and transcribes it with whisper.cpp large-v3-turbo. Each result is saved next to its file." />
    </Form>
  );
}
