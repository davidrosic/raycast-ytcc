import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  LocalStorage,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  showInFinder,
  showToast,
  useNavigation,
} from "@raycast/api";
import { basename, dirname } from "node:path";
import { useEffect, useMemo, useState } from "react";
import {
  Caption,
  ExportFormat,
  MediaFormat,
  Settings,
  downloadCaption,
  downloadMedia,
  favoriteScore,
  formatSize,
  inspectMedia,
  isYoutubeUrl,
  languageLabel,
  localFileInfo,
  localPath,
  mediaUrl,
  rankFavorites,
  transcribe,
  transcribeFile,
  whisperLanguageName,
  whisperLanguages,
  youtubeThumbnail,
} from "./core";
import {
  detailMarkdown,
  errorMessage,
  mediaFormats,
  useLinkSearch,
  useVideo,
  videoDetail,
} from "./video";

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

const languageNames = (language: { code: string; name: string }) => [
  language.code,
  language.name,
];

/** The video URL for search text that is a link, or undefined for filter text and unfinished links. */
function typedLink(text: string): { isLink: boolean; url?: string } {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(text) && !isYoutubeUrl(text))
    return { isLink: false };
  try {
    return { isLink: true, url: mediaUrl(text) };
  } catch {
    return { isLink: true };
  }
}

export default function Command() {
  const { push } = useNavigation();
  const settings = getPreferenceValues<Settings>();
  const [url, setUrl] = useState<string>();
  const [favoriteLanguages, setFavoriteLanguages] = useState(
    settings.favoriteLanguages ?? "",
  );
  const search = useLinkSearch(
    (link) => setUrl(mediaUrl(link)),
    (text) => {
      const path = localPath(text);
      if (path && localFileInfo(path)?.isFile) push(transcribeForm(path));
    },
  );
  const state = useVideo(url, settings, inspectMedia);
  const { video, preview, error } = state;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [activeMedia, setActiveMedia] = useState<MediaFormat>();
  const [activeFile, setActiveFile] = useState<string>();
  const [lastFile, setLastFile] = useState<string>();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("raw");

  useEffect(() => {
    LocalStorage.getItem<string>("favoriteLanguages").then(
      (value) => value !== undefined && setFavoriteLanguages(value),
      () => undefined,
    );
  }, []);

  function saveFavoriteLanguages(value: string) {
    setFavoriteLanguages(value);
    LocalStorage.setItem("favoriteLanguages", value);
  }

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

  async function transcribeLocal(
    path: string,
    language: string,
    format: ExportFormat,
  ) {
    setBusy(true);
    setActiveFile(path);
    setProgress("Preparing transcription…");
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Transcribing ${basename(path)}…`,
    });
    try {
      const output = await transcribeFile(
        path,
        language,
        format,
        settings,
        (message) => {
          setProgress(message);
          toast.title = message;
        },
      );
      setLastFile(output);
      toast.style = Toast.Style.Success;
      toast.title = "Transcription saved";
      toast.message = output;
      toast.primaryAction = {
        title: "Show in Finder",
        onAction: () => showInFinder(output),
      };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Transcription failed";
      toast.message = errorMessage(error);
    } finally {
      setBusy(false);
      setActiveFile(undefined);
      setProgress("");
    }
  }

  const defaultWhisperLanguage =
    rankFavorites(whisperLanguages, languageNames, favoriteLanguages)
      .favorites[0]?.code ??
    rankFavorites(whisperLanguages, languageNames, settings.whisperLanguage)
      .favorites[0]?.code ??
    "auto";

  function transcribeForm(path: string) {
    return (
      <TranscribeFileForm
        path={path}
        favoriteLanguages={favoriteLanguages}
        defaultLanguage={defaultWhisperLanguage}
        onTranscribe={transcribeLocal}
      />
    );
  }

  const query = search.text.trim();
  const filePath = localPath(query);
  const fileInfo = useMemo(
    () => (filePath ? localFileInfo(filePath) : undefined),
    [filePath],
  );
  const link = filePath ? { isLink: false } : typedLink(query);
  const pendingUrl = link.url !== url ? link.url : undefined;
  const filter = link.isLink || filePath ? "" : query.toLocaleLowerCase();
  const matches = (...texts: string[]) =>
    !filter || texts.some((text) => text.toLocaleLowerCase().includes(filter));

  const captions = (filePath ? [] : (video?.captions ?? [])).filter(
    (caption) =>
      matches(languageLabel(caption.language), caption.language) ||
      favoriteScore(caption, filter) >= 60,
  );
  const { favorites, suggestions } = rankFavorites(
    [...captions].sort(
      (a, b) =>
        Number(b.kind === "manual") - Number(a.kind === "manual") ||
        Number(/orig/i.test(b.language)) - Number(/orig/i.test(a.language)) ||
        languageLabel(a.language).localeCompare(languageLabel(b.language)),
    ),
    (caption) => [caption.language, languageLabel(caption.language)],
    favoriteLanguages,
  );
  const featured = new Set([...favorites, ...suggestions]);
  const manual = captions.filter(
    (caption) => caption.kind === "manual" && !featured.has(caption),
  );
  const automatic = captions.filter(
    (caption) => caption.kind === "automatic" && !featured.has(caption),
  );
  const mediaItems = mediaFormats.filter(({ value, subtitle }) =>
    matches(value, subtitle, value === "mp4" ? "video" : "audio"),
  );

  const moreActions = (
    <ActionPanel.Section>
      {lastFile && (
        <Action
          title="Show Last File in Finder"
          icon={Icon.Finder}
          onAction={() => showInFinder(lastFile)}
        />
      )}
      <Action.Push
        title="Edit Favorite Languages"
        icon={Icon.Star}
        target={
          <FavoriteLanguagesForm
            value={favoriteLanguages}
            onSave={saveFavoriteLanguages}
          />
        }
      />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </ActionPanel.Section>
  );
  const item = (caption: Caption) => (
    <List.Item
      key={`${caption.kind}-${caption.language}`}
      title={languageLabel(caption.language)}
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
          {moreActions}
        </ActionPanel>
      }
    />
  );

  return (
    <List
      isLoading={busy || Boolean(url && !video && !error && !filePath)}
      isShowingDetail={Boolean(url || pendingUrl || filePath)}
      filtering={false}
      searchText={search.text}
      onSearchTextChange={search.onChange}
      navigationTitle={video?.title || preview.title || "YouTube Download"}
      searchBarPlaceholder={
        url
          ? "Filter languages, or paste another link or file path…"
          : "Paste a YouTube link or a file path…"
      }
      searchBarAccessory={
        url && !filePath ? (
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
        ) : undefined
      }
    >
      <List.EmptyView
        icon={url ? Icon.MagnifyingGlass : Icon.Link}
        title={
          url ? "No matching languages or formats" : "Paste a YouTube link"
        }
        description={
          url
            ? "Clear the search to see everything, or paste another link."
            : "A YouTube link in your clipboard is searched when the command opens, and a pasted link is searched right away. Links from other sites: paste, then press Return. To transcribe an audio or video file, paste its full path."
        }
        actions={<ActionPanel>{moreActions}</ActionPanel>}
      />
      {pendingUrl && (
        <List.Item
          title="Search This Link"
          subtitle={pendingUrl}
          icon={Icon.MagnifyingGlass}
          detail={videoDetail(
            {
              preview: {
                thumbnail: youtubeThumbnail(pendingUrl),
                title: "Press Return to search this link",
              },
            },
            [{ title: "Link", text: pendingUrl }],
          )}
          actions={
            <ActionPanel>
              <Action
                title="Search This Link"
                icon={Icon.MagnifyingGlass}
                onAction={() => setUrl(pendingUrl)}
              />
              {moreActions}
            </ActionPanel>
          }
        />
      )}
      {filePath && (
        <List.Section title="Transcribe File">
          <List.Item
            title={basename(filePath) || filePath}
            subtitle={
              (activeFile === filePath && progress) ||
              (fileInfo?.isFile
                ? dirname(filePath)
                : fileInfo
                  ? "Not a file"
                  : "File not found")
            }
            icon={fileInfo?.isFile ? Icon.Microphone : Icon.Warning}
            detail={
              <List.Item.Detail
                markdown={detailMarkdown(
                  fileInfo?.isFile
                    ? {
                        title: basename(filePath),
                        note: "Press ↵ to choose the spoken language and output, then ⌘↵ to transcribe. Press ⌘↵ here to transcribe with the settings below.",
                        facts: [
                          { title: "Folder", text: dirname(filePath) },
                          { title: "Size", text: formatSize(fileInfo.size) },
                          {
                            title: "Modified",
                            text: fileInfo.modified.toISOString().slice(0, 10),
                          },
                          {
                            title: "Spoken Language",
                            text: whisperLanguageName(defaultWhisperLanguage),
                          },
                          { title: "Output", text: formatTitle("raw") },
                          { title: "Model", text: "ggml-large-v3-turbo" },
                        ],
                      }
                    : {
                        title: fileInfo ? "Not a file" : "File not found",
                        note: "Enter the full path of an audio or video file, for example `/Users/you/Music/interview.m4a`.",
                        facts: [{ title: "Path", text: filePath }],
                      },
                )}
              />
            }
            actions={
              <ActionPanel>
                {fileInfo?.isFile && (
                  <>
                    <Action.Push
                      title="Choose Language and Output"
                      icon={Icon.Microphone}
                      target={transcribeForm(filePath)}
                    />
                    <Action
                      title={
                        defaultWhisperLanguage === "auto"
                          ? "Transcribe with Language Detection"
                          : `Transcribe in ${whisperLanguageName(defaultWhisperLanguage)}`
                      }
                      icon={Icon.Waveform}
                      onAction={() =>
                        transcribeLocal(filePath, defaultWhisperLanguage, "raw")
                      }
                    />
                    <Action.ShowInFinder path={filePath} />
                  </>
                )}
                {moreActions}
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      {url && !video && !filePath && (
        <List.Item
          title={error ? "Could not inspect video" : "Loading video…"}
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
              {moreActions}
            </ActionPanel>
          }
        />
      )}
      {video &&
        !filePath &&
        !video.captions.length &&
        matches("whisper transcribe") && (
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
                  {moreActions}
                </ActionPanel>
              }
            />
          </List.Section>
        )}
      {favorites.length > 0 && (
        <List.Section title="Favorite Languages" subtitle={favoriteLanguages}>
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
      {video && !filePath && mediaItems.length > 0 && (
        <List.Section title="Audio & Video">
          {mediaItems.map(({ value, subtitle }) => (
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
                  {moreActions}
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

function FavoriteLanguagesForm({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Favorite Languages"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Favorite Languages"
            icon={Icon.Star}
            onSubmit={(values: { favoriteLanguages: string }) => {
              onSave(values.favoriteLanguages.trim());
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="favoriteLanguages"
        title="Favorite Languages"
        placeholder="Serbian, English"
        defaultValue={value}
        autoFocus
        info="Comma-separated names or codes. Matches ignore case and (orig)."
      />
    </Form>
  );
}

function TranscribeFileForm({
  path,
  favoriteLanguages,
  defaultLanguage,
  onTranscribe,
}: {
  path: string;
  favoriteLanguages: string;
  defaultLanguage: string;
  onTranscribe: (path: string, language: string, format: ExportFormat) => void;
}) {
  const { pop } = useNavigation();
  const { favorites, suggestions } = rankFavorites(
    whisperLanguages,
    languageNames,
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
      navigationTitle={`Transcribe ${basename(path)}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Transcribe"
            icon={Icon.Microphone}
            onSubmit={(values: { language: string; format: ExportFormat }) => {
              pop();
              onTranscribe(path, values.language, values.format);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="File" text={path} />
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
      <Form.Description text="⌘↵ converts the audio to 16 kHz WAV with ffmpeg and transcribes it with whisper.cpp large-v3-turbo. The result is saved next to the file." />
    </Form>
  );
}
