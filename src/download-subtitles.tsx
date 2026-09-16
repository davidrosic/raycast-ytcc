import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  showInFinder,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import {
  Caption,
  ExportFormat,
  MediaFormat,
  Settings,
  downloadCaption,
  downloadMedia,
  favoriteLanguageTerms,
  favoriteScore,
  inspect,
  languageLabel,
  transcribe,
  youtubeUrl,
} from "./core";
import { errorMessage, mediaFormats, useVideo, videoDetail } from "./video";

const captionFormats: { value: ExportFormat; title: string }[] = [
  { value: "raw", title: "RAW · TXT (all cues)" },
  { value: "txt", title: "Clean TXT" },
  { value: "srt", title: "SRT" },
  { value: "vtt", title: "VTT" },
];

function formatTitle(format: ExportFormat): string {
  return (
    captionFormats.find((item) => item.value === format)?.title ||
    format.toUpperCase()
  );
}

export default function Command() {
  const { push } = useNavigation();
  const settings = getPreferenceValues<Settings>();
  const [url, setUrl] = useState("");

  function submit(values: { favoriteLanguages: string }) {
    let videoUrl: string;
    try {
      videoUrl = youtubeUrl(url);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Invalid YouTube link",
        message: errorMessage(error),
      });
      return;
    }
    push(
      <CaptionList
        url={videoUrl}
        settings={{ ...settings, favoriteLanguages: values.favoriteLanguages }}
      />,
    );
  }

  return (
    <Form
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Find Captions"
            icon={Icon.MagnifyingGlass}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="YouTube URL"
        placeholder="Paste a YouTube video link"
        value={url}
        onChange={setUrl}
        autoFocus
      />
      <Form.TextField
        id="favoriteLanguages"
        title="Favorite Languages"
        placeholder="Serbian, English"
        defaultValue={settings.favoriteLanguages || ""}
        storeValue
        info="Comma-separated names or codes. Matches ignore case and (orig)."
      />
      <Form.Description text="Browse creator captions and YouTube automatic captions in every available language. Videos without captions can be transcribed locally." />
    </Form>
  );
}

function CaptionList({ url, settings }: { url: string; settings: Settings }) {
  const state = useVideo(url, settings, inspect);
  const { video, preview, error } = state;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [activeMedia, setActiveMedia] = useState<MediaFormat>();
  const [lastFile, setLastFile] = useState<string>();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("raw");

  async function save(caption: Caption, format: ExportFormat) {
    if (!video) return;
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Downloading ${caption.language} ${formatTitle(format)}…`,
    });
    try {
      const path = await downloadCaption(
        video,
        caption,
        format,
        settings,
        (message) => {
          toast.title = message;
        },
      );
      setLastFile(path);
      toast.style = Toast.Style.Success;
      toast.title = "Subtitle saved";
      toast.message = path;
      toast.primaryAction = {
        title: "Show in Finder",
        onAction: () => showInFinder(path),
      };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download failed";
      toast.message = errorMessage(error);
    } finally {
      setBusy(false);
    }
  }

  async function whisper() {
    if (!video) return;
    setBusy(true);
    setProgress("Preparing transcription…");
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Transcribing video…",
    });
    try {
      const files = await transcribe(video, settings, (message) =>
        setProgress(message),
      );
      setLastFile(files[0]);
      toast.style = Toast.Style.Success;
      toast.title = "Transcription saved";
      toast.message = "SRT, VTT and TXT files are ready";
      toast.primaryAction = {
        title: "Show in Finder",
        onAction: () => showInFinder(files[0]),
      };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Transcription failed";
      toast.message = errorMessage(error);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function media(format: MediaFormat) {
    if (!video) return;
    setBusy(true);
    setActiveMedia(format);
    setProgress(`Downloading ${format.toUpperCase()}…`);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Downloading ${format.toUpperCase()}…`,
    });
    try {
      const path = await downloadMedia(video, format, settings, setProgress);
      setLastFile(path);
      toast.style = Toast.Style.Success;
      toast.title = `${format.toUpperCase()} saved`;
      toast.message = path;
      toast.primaryAction = {
        title: "Show in Finder",
        onAction: () => showInFinder(path),
      };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download failed";
      toast.message = errorMessage(error);
    } finally {
      setBusy(false);
      setActiveMedia(undefined);
      setProgress("");
    }
  }

  const captions = video?.captions ?? [];
  const favoriteTerms = favoriteLanguageTerms(settings.favoriteLanguages);
  const ranked = captions.map((caption) => ({
    caption,
    score: Math.max(
      0,
      ...favoriteTerms.map((term) => favoriteScore(caption, term)),
    ),
  }));
  const byPreference = (
    a: (typeof ranked)[number],
    b: (typeof ranked)[number],
  ) =>
    b.score - a.score ||
    Number(b.caption.kind === "manual") - Number(a.caption.kind === "manual") ||
    Number(/orig/i.test(b.caption.language)) -
      Number(/orig/i.test(a.caption.language)) ||
    languageLabel(a.caption.language).localeCompare(
      languageLabel(b.caption.language),
    );
  const favorites = ranked
    .filter((item) => item.score >= 60)
    .sort(byPreference)
    .map((item) => item.caption);
  const suggestions = favorites.length
    ? []
    : ranked
        .filter((item) => item.score >= 30)
        .sort(byPreference)
        .slice(0, 5)
        .map((item) => item.caption);
  const featured = new Set([...favorites, ...suggestions]);
  const manual = captions.filter(
    (caption) => caption.kind === "manual" && !featured.has(caption),
  );
  const automatic = captions.filter(
    (caption) => caption.kind === "automatic" && !featured.has(caption),
  );
  const preferencesAction = (
    <Action
      title="Open Extension Preferences"
      icon={Icon.Gear}
      onAction={openExtensionPreferences}
    />
  );
  const lastFileAction = lastFile && (
    <Action
      title="Show Last File in Finder"
      icon={Icon.Finder}
      onAction={() => showInFinder(lastFile)}
    />
  );
  const item = (caption: Caption) => (
    <List.Item
      key={`${caption.kind}-${caption.language}`}
      title={languageLabel(caption.language)}
      keywords={[caption.language, languageLabel(caption.language)]}
      subtitle={caption.kind === "manual" ? "Creator" : "Automatic"}
      icon={caption.kind === "manual" ? Icon.Text : Icon.Wand}
      detail={videoDetail(state, [
        { title: "Language", text: caption.language },
        {
          title: "Captions",
          text:
            caption.kind === "manual"
              ? "Creator captions"
              : "YouTube automatic captions",
        },
        { title: "Format", text: formatTitle(selectedFormat) },
      ])}
      actions={
        <ActionPanel>
          <Action
            title={`Download ${formatTitle(selectedFormat)}`}
            icon={Icon.Download}
            onAction={() => save(caption, selectedFormat)}
          />
          <ActionPanel.Submenu
            title="Other Caption Formats"
            icon={Icon.Document}
          >
            {captionFormats
              .filter((item) => item.value !== selectedFormat)
              .map((item) => (
                <Action
                  key={item.value}
                  title={`Download ${item.title}`}
                  onAction={() => save(caption, item.value)}
                />
              ))}
          </ActionPanel.Submenu>
          {lastFileAction}
          {preferencesAction}
        </ActionPanel>
      }
    />
  );

  return (
    <List
      isLoading={busy || (!video && !error)}
      isShowingDetail
      navigationTitle={video?.title || preview.title || "YouTube Captions"}
      searchBarPlaceholder="Filter languages…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Caption Format"
          value={selectedFormat}
          onChange={(value) => setSelectedFormat(value as ExportFormat)}
        >
          {captionFormats.map((item) => (
            <List.Dropdown.Item
              key={item.value}
              title={item.title}
              value={item.value}
            />
          ))}
        </List.Dropdown>
      }
    >
      {!video && (
        <List.Item
          title={error ? "Could not inspect video" : "Finding captions…"}
          subtitle={error}
          icon={error ? Icon.Warning : Icon.MagnifyingGlass}
          detail={videoDetail(state)}
          actions={
            <ActionPanel>
              {error && (
                <Action
                  title="Try Again"
                  icon={Icon.RotateClockwise}
                  onAction={state.retry}
                />
              )}
              {preferencesAction}
            </ActionPanel>
          }
        />
      )}
      {video && !captions.length && (
        <List.Section title="No Captions Available">
          <List.Item
            title="Transcribe with Whisper"
            subtitle={progress || "Local large-v3-turbo"}
            icon={Icon.Microphone}
            detail={videoDetail(state, [
              { title: "Model", text: "ggml-large-v3-turbo" },
              {
                title: "Spoken Language",
                text: settings.whisperLanguage?.trim() || "Serbian",
              },
              { title: "Output", text: "SRT, VTT and TXT" },
            ])}
            actions={
              <ActionPanel>
                <Action
                  title="Transcribe with Whisper"
                  icon={Icon.Microphone}
                  onAction={whisper}
                />
                {lastFileAction}
                {preferencesAction}
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      {favorites.length > 0 && (
        <List.Section
          title="Favorite Languages"
          subtitle={settings.favoriteLanguages}
        >
          {favorites.map(item)}
        </List.Section>
      )}
      {suggestions.length > 0 && (
        <List.Section
          title="Suggested Languages"
          subtitle="Closest matches to your favorites"
        >
          {suggestions.map(item)}
        </List.Section>
      )}
      {video && (
        <List.Section title="Audio & Video">
          {mediaFormats.map(({ value, subtitle }) => (
            <List.Item
              key={value}
              title={`Download ${value.toUpperCase()}`}
              subtitle={(activeMedia === value && progress) || subtitle}
              icon={value === "mp4" ? Icon.Video : Icon.Music}
              detail={videoDetail(state, [
                { title: "Format", text: value.toUpperCase() },
                { title: "Quality", text: subtitle },
              ])}
              actions={
                <ActionPanel>
                  <Action
                    title={`Download ${value.toUpperCase()}`}
                    icon={Icon.Download}
                    onAction={() => media(value)}
                  />
                  {lastFileAction}
                  {preferencesAction}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {manual.length > 0 && (
        <List.Section
          title="Creator Captions"
          subtitle={`${manual.length} languages`}
        >
          {manual.map(item)}
        </List.Section>
      )}
      {automatic.length > 0 && (
        <List.Section
          title="Automatic Captions"
          subtitle={`${automatic.length} languages`}
        >
          {automatic.map(item)}
        </List.Section>
      )}
    </List>
  );
}
