import { Form, getSelectedFinderItems } from "@raycast/api";
import { useEffect, useState } from "react";
import { defaultWhisperLanguage, localFileInfo } from "./core";
import { preferences } from "./preferences";
import {
  TranscribeForm,
  transcribeWithToast,
  useFavoriteLanguages,
} from "./transcription";

export default function Command() {
  const settings = preferences();
  const favoriteLanguages = useFavoriteLanguages(settings);
  const [selection, setSelection] = useState<string[]>();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getSelectedFinderItems().then(
      (items) =>
        setSelection(
          items
            .map((item) => item.path.replace(/(.)\/$/, "$1"))
            .filter((path) => localFileInfo(path)),
        ),
      () => setSelection([]),
    );
  }, []);

  if (!selection || !favoriteLanguages.loaded) return <Form isLoading />;

  return (
    <TranscribeForm
      initialPaths={selection}
      settings={settings}
      favoriteLanguages={favoriteLanguages.value}
      defaultLanguage={defaultWhisperLanguage(
        favoriteLanguages.value,
        settings.whisperLanguage,
      )}
      isLoading={running}
      note={
        selection.length
          ? undefined
          : "Nothing is selected in Finder. Choose files or folders below, or select them in Finder before opening this command."
      }
      onTranscribe={async (paths, options) => {
        setRunning(true);
        try {
          await transcribeWithToast(paths, options, settings);
        } finally {
          setRunning(false);
        }
      }}
    />
  );
}
