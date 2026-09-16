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
  Video,
  downloadMedia,
  inspectMedia,
} from "./core";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Command() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useNavigation();
  const settings = getPreferenceValues<Settings>();

  async function submit() {
    setLoading(true);
    try {
      push(
        <MediaList
          video={await inspectMedia(url, settings)}
          settings={settings}
        />,
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not inspect video",
        message: message(error),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form
      isLoading={loading}
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Find Media" onSubmit={submit} />
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

function MediaList({ video, settings }: { video: Video; settings: Settings }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastFile, setLastFile] = useState<string>();

  async function save(format: MediaFormat) {
    setBusy(true);
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
      toast.message = message(error);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <List
      isLoading={busy}
      navigationTitle={video.title}
      searchBarPlaceholder="Choose a format…"
    >
      <List.Section title={video.title} subtitle={progress || video.id}>
        {(["mp3", "m4a", "mp4"] as const).map((format) => (
          <List.Item
            key={format}
            title={`Download ${format.toUpperCase()}`}
            subtitle={format === "mp4" ? "Video with audio" : "Audio only"}
            icon={format === "mp4" ? Icon.Video : Icon.Music}
            actions={
              <ActionPanel>
                <Action
                  title={`Download ${format.toUpperCase()}`}
                  icon={Icon.Download}
                  onAction={() => save(format)}
                />
                {lastFile && (
                  <Action
                    title="Show Last File in Finder"
                    icon={Icon.Finder}
                    onAction={() => showInFinder(lastFile)}
                  />
                )}
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
