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
  MediaFormat,
  Settings,
  downloadMedia,
  inspectMedia,
  mediaUrl,
} from "./core";
import { errorMessage, mediaFormats, useVideo, videoDetail } from "./video";

export default function Command() {
  const { push } = useNavigation();
  const settings = getPreferenceValues<Settings>();
  const [url, setUrl] = useState("");

  function submit() {
    let videoUrl: string;
    try {
      videoUrl = mediaUrl(url);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Invalid video link",
        message: errorMessage(error),
      });
      return;
    }
    push(<MediaList url={videoUrl} settings={settings} />);
  }

  return (
    <Form
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Find Media"
            icon={Icon.MagnifyingGlass}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="Video URL"
        placeholder="Paste a supported video link"
        value={url}
        onChange={setUrl}
        autoFocus
      />
      <Form.Description text="Download one video as MP4 or extract its audio as MP3 or M4A. Supports sites recognized by yt-dlp." />
    </Form>
  );
}

function MediaList({ url, settings }: { url: string; settings: Settings }) {
  const state = useVideo(url, settings, inspectMedia);
  const { video, preview, error } = state;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [active, setActive] = useState<MediaFormat>();
  const [lastFile, setLastFile] = useState<string>();

  async function save(format: MediaFormat) {
    if (!video) return;
    setBusy(true);
    setActive(format);
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
      setActive(undefined);
      setProgress("");
    }
  }

  const preferencesAction = (
    <Action
      title="Open Extension Preferences"
      icon={Icon.Gear}
      onAction={openExtensionPreferences}
    />
  );

  return (
    <List
      isLoading={busy || (!video && !error)}
      isShowingDetail
      navigationTitle={video?.title || preview.title || "Download Media"}
      searchBarPlaceholder="Choose a format…"
    >
      {!video && (
        <List.Item
          title={error ? "Could not inspect video" : "Finding media…"}
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
      {video &&
        mediaFormats.map(({ value, subtitle }) => (
          <List.Item
            key={value}
            title={`Download ${value.toUpperCase()}`}
            subtitle={(active === value && progress) || subtitle}
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
                  onAction={() => save(value)}
                />
                {lastFile && (
                  <Action
                    title="Show Last File in Finder"
                    icon={Icon.Finder}
                    onAction={() => showInFinder(lastFile)}
                  />
                )}
                {preferencesAction}
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
