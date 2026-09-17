import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  showInFinder,
  showToast,
  useNavigation,
} from "@raycast/api";
import { basename, dirname } from "node:path";
import { useMemo, useRef, useState } from "react";
import { preferences } from "./preferences";
import {
  Caption,
  ExportFormat,
  MediaFormat,
  defaultWhisperLanguage,
  downloadCaption,
  downloadMedia,
  favoriteScore,
  formatSize,
  inspectMedia,
  isYoutubeUrl,
  languageLabel,
  localFileInfo,
  isCanceled,
  localPath,
  mediaUrl,
  rankFavorites,
  whisperLanguageName,
  youtubeThumbnail,
} from "./core";
import { cancelJob, isActive } from "./jobs";
import {
  QueueList,
  addToQueue,
  fileJobs,
  jobSubtitle,
  jobToast,
  useQueue,
} from "./queue";
import {
  TranscribeForm,
  captionFormats,
  formatTitle,
  useFavoriteLanguages,
  useWhisperModels,
} from "./transcription";
import {
  detailMarkdown,
  errorMessage,
  mediaFormats,
  useLinkSearch,
  useVideo,
  videoDetail,
} from "./video";
import { TranscriptionOptions, modelName } from "./whisper";

export { runQueueWorker } from "./jobs";

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
  const { push, pop } = useNavigation();
  const settings = preferences();
  const [url, setUrl] = useState<string>();
  const favoriteLanguages = useFavoriteLanguages(settings);
  const search = useLinkSearch(
    (link) => setUrl(mediaUrl(link)),
    (text) => {
      const path = localPath(text);
      if (path && localFileInfo(path)) push(transcribeForm(path));
    },
  );
  const state = useVideo(url, settings, inspectMedia);
  const { video, preview, error } = state;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [activeMedia, setActiveMedia] = useState<MediaFormat>();
  const [lastFile, setLastFile] = useState<string>();
  const showQueue = () => push(<QueueList settings={settings} />);
  const queue = useQueue(settings, (job) => {
    if (job.outputs?.length) setLastFile(job.outputs[0]);
    jobToast(job, showQueue);
  });
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("raw");
  const download = useRef<AbortController | undefined>(undefined);

  /** Runs one download at a time with a toast that can cancel it. */
  async function withDownload(
    title: string,
    work: (
      signal: AbortSignal,
      onProgress: (message: string) => void,
    ) => Promise<string>,
    saved: string,
  ) {
    download.current?.abort();
    const controller = new AbortController();
    download.current = controller;
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title,
      primaryAction: {
        title: "Cancel Download",
        onAction: () => controller.abort(),
      },
    });
    try {
      const path = await work(controller.signal, (message) => {
        toast.title = message;
        setProgress(message);
      });
      setLastFile(path);
      toast.style = Toast.Style.Success;
      toast.title = saved;
      toast.message = path;
      toast.primaryAction = {
        title: "Show in Finder",
        onAction: () => showInFinder(path),
      };
    } catch (error) {
      toast.primaryAction = undefined;
      if (isCanceled(error)) {
        toast.style = Toast.Style.Success;
        toast.title = "Download canceled";
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = "Download failed";
        toast.message = errorMessage(error);
      }
    } finally {
      if (download.current === controller) {
        download.current = undefined;
        setBusy(false);
        setActiveMedia(undefined);
        setProgress("");
      }
    }
  }

  function save(caption: Caption, format: ExportFormat) {
    if (!video) return;
    withDownload(
      `Downloading ${caption.language} ${formatTitle(format)}…`,
      (signal, onProgress) =>
        downloadCaption(video, caption, format, settings, onProgress, signal),
      "Subtitle saved",
    );
  }

  function media(format: MediaFormat) {
    if (!video) return;
    setActiveMedia(format);
    withDownload(
      `Downloading ${format.toUpperCase()}…`,
      (signal, onProgress) =>
        downloadMedia(video, format, settings, onProgress, signal),
      `${format.toUpperCase()} saved`,
    );
  }

  function queueFiles(paths: string[], options: TranscriptionOptions) {
    addToQueue(settings, fileJobs(paths, options), showQueue);
  }

  function queueVideo(options: TranscriptionOptions) {
    if (!video) return;
    const { id, title, url } = video;
    addToQueue(
      settings,
      [{ title, spec: { kind: "video", video: { id, title, url }, options } }],
      showQueue,
    );
  }

  const { defaultModel } = useWhisperModels(settings);
  const whisperLanguage = defaultWhisperLanguage(
    favoriteLanguages.value,
    settings.whisperLanguage,
  );

  function transcribeForm(path: string) {
    return (
      <TranscribeForm
        initialPaths={[path]}
        settings={settings}
        favoriteLanguages={favoriteLanguages.value}
        defaultLanguage={whisperLanguage}
        onTranscribe={(paths, options) => {
          pop();
          queueFiles(paths, options);
        }}
      />
    );
  }

  function videoTranscribeForm() {
    return (
      <TranscribeForm
        videoTitle={video?.title}
        settings={settings}
        favoriteLanguages={favoriteLanguages.value}
        defaultLanguage={whisperLanguage}
        defaultFormat={selectedFormat}
        onTranscribe={(_, options) => {
          pop();
          queueVideo(options);
        }}
      />
    );
  }

  const whisperTitle =
    whisperLanguage === "auto"
      ? "Transcribe with Language Detection"
      : `Transcribe in ${whisperLanguageName(whisperLanguage)}`;

  const query = search.text.trim();
  const filePath = localPath(query);
  const fileInfo = useMemo(
    () => (filePath ? localFileInfo(filePath) : undefined),
    [filePath],
  );
  const fileJob = queue.jobs.find(
    (job) =>
      isActive(job) && job.spec.kind === "file" && job.spec.path === filePath,
  );
  const videoJob = queue.jobs.find(
    (job) =>
      isActive(job) &&
      job.spec.kind === "video" &&
      job.spec.video.id === video?.id,
  );
  const cancelAction = (job: (typeof queue.jobs)[number]) => (
    <Action
      title="Cancel Transcription"
      icon={Icon.XMarkCircle}
      style={Action.Style.Destructive}
      onAction={() => {
        cancelJob(queue.folder, job);
        queue.refresh();
      }}
    />
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
    favoriteLanguages.value,
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
      {busy && (
        <Action
          title="Cancel Download"
          icon={Icon.XMarkCircle}
          style={Action.Style.Destructive}
          onAction={() => download.current?.abort()}
        />
      )}
      {lastFile && (
        <Action
          title="Show Last File in Finder"
          icon={Icon.Finder}
          onAction={() => showInFinder(lastFile)}
        />
      )}
      <Action.Push
        title="Show Transcription Queue"
        icon={Icon.List}
        target={<QueueList settings={settings} />}
      />
      <Action.Push
        title="Edit Favorite Languages"
        icon={Icon.Star}
        target={
          <FavoriteLanguagesForm
            value={favoriteLanguages.value}
            onSave={favoriteLanguages.save}
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
        <List.Section
          title={
            fileInfo?.isFile === false ? "Transcribe Folder" : "Transcribe File"
          }
        >
          <List.Item
            title={basename(filePath) || filePath}
            subtitle={
              fileJob
                ? jobSubtitle(fileJob)
                : fileInfo
                  ? dirname(filePath)
                  : "Not found"
            }
            icon={
              !fileInfo
                ? Icon.Warning
                : fileInfo.isFile
                  ? Icon.Microphone
                  : Icon.Folder
            }
            detail={
              <List.Item.Detail
                markdown={detailMarkdown(
                  fileInfo && !fileInfo.isFile
                    ? {
                        title: basename(filePath),
                        note: "Press ↵ to choose the spoken language, output and model. Audio and video files in this folder and its subfolders are added to the transcription queue.",
                        facts: [{ title: "Folder", text: filePath }],
                      }
                    : fileInfo
                      ? {
                          title: basename(filePath),
                          note: "Press ↵ to choose the spoken language and output, then ⌘↵ to transcribe. Press ⌘↵ here to transcribe with the settings below.",
                          facts: [
                            { title: "Folder", text: dirname(filePath) },
                            { title: "Size", text: formatSize(fileInfo.size) },
                            {
                              title: "Modified",
                              text: fileInfo.modified
                                .toISOString()
                                .slice(0, 10),
                            },
                            {
                              title: "Spoken Language",
                              text: whisperLanguageName(whisperLanguage),
                            },
                            { title: "Output", text: formatTitle("raw") },
                            {
                              title: "Model",
                              text: defaultModel
                                ? modelName(defaultModel)
                                : "Not found",
                            },
                          ],
                        }
                      : {
                          title: "Not found",
                          note: "Enter the full path of an audio or video file or a folder, for example `/Users/you/Music/interview.m4a`.",
                          facts: [{ title: "Path", text: filePath }],
                        },
                )}
              />
            }
            actions={
              <ActionPanel>
                {fileJob && cancelAction(fileJob)}
                {fileInfo && (
                  <>
                    <Action.Push
                      title="Choose Language and Output"
                      icon={Icon.Microphone}
                      target={transcribeForm(filePath)}
                    />
                    {fileInfo.isFile && (
                      <Action
                        title={whisperTitle}
                        icon={Icon.Waveform}
                        onAction={() =>
                          queueFiles([filePath], {
                            language: whisperLanguage,
                            format: "raw",
                          })
                        }
                      />
                    )}
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
              subtitle={
                videoJob
                  ? jobSubtitle(videoJob)
                  : defaultModel
                    ? `Local ${modelName(defaultModel)}`
                    : "Local"
              }
              icon={Icon.Microphone}
              detail={videoDetail(state, [
                {
                  title: "Model",
                  text: defaultModel ? modelName(defaultModel) : "Not found",
                },
                {
                  title: "Spoken Language",
                  text: whisperLanguageName(whisperLanguage),
                },
                { title: "Output", text: formatTitle(selectedFormat) },
              ])}
              actions={
                <ActionPanel>
                  {videoJob && cancelAction(videoJob)}
                  <Action.Push
                    title="Choose Language and Output"
                    icon={Icon.Microphone}
                    target={videoTranscribeForm()}
                  />
                  <Action
                    title={whisperTitle}
                    icon={Icon.Waveform}
                    onAction={() =>
                      queueVideo({
                        language: whisperLanguage,
                        format: selectedFormat,
                      })
                    }
                  />
                  {moreActions}
                </ActionPanel>
              }
            />
          </List.Section>
        )}
      {favorites.length > 0 && (
        <List.Section
          title="Favorite Languages"
          subtitle={favoriteLanguages.value}
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
