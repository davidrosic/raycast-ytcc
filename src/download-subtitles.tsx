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
  Video,
  downloadCaption,
  downloadMedia,
  inspect,
  languageLabel,
  transcribe,
} from "./core";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useNavigation();
  const settings = getPreferenceValues<Settings>();

  async function submit() {
    setLoading(true);
    try {
      push(
        <CaptionList
          video={await inspect(url, settings)}
          settings={settings}
        />,
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not inspect video",
        message: errorMessage(error),
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
          <Action.SubmitForm title="Find Captions" onSubmit={submit} />
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
      <Form.Description text="Browse creator captions and YouTube automatic captions in every available language. Videos without captions can be transcribed locally." />
    </Form>
  );
}

function CaptionList({
  video,
  settings,
}: {
  video: Video;
  settings: Settings;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastFile, setLastFile] = useState<string>();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("raw");

  async function save(caption: Caption, format: ExportFormat) {
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
    setBusy(true);
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
      setProgress("");
    }
  }

  const manual = video.captions.filter((caption) => caption.kind === "manual");
  const automatic = video.captions.filter(
    (caption) => caption.kind === "automatic",
  );
  const item = (caption: Caption) => (
    <List.Item
      key={`${caption.kind}-${caption.language}`}
      title={languageLabel(caption.language)}
      keywords={[caption.language, languageLabel(caption.language)]}
      subtitle={
        caption.kind === "manual"
          ? "Creator captions"
          : "YouTube automatic captions"
      }
      icon={caption.kind === "manual" ? Icon.Text : Icon.Wand}
      accessories={[{ text: caption.language }]}
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
  );

  return (
    <List
      isLoading={busy}
      navigationTitle={video.title}
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
      <List.Section title={video.title} subtitle={video.id}>
        {!video.captions.length && (
          <List.Item
            title="No captions available"
            subtitle={
              progress ||
              "Download audio and transcribe with local whisper.cpp large-v3-turbo"
            }
            icon={Icon.Microphone}
            actions={
              <ActionPanel>
                <Action
                  title="Transcribe with Whisper"
                  icon={Icon.Microphone}
                  onAction={whisper}
                />
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>
      <List.Section title="Audio & Video">
        <List.Item
          title="Download MP3"
          subtitle={progress || "Audio only"}
          icon={Icon.Music}
          actions={
            <ActionPanel>
              <Action title="Download MP3" onAction={() => media("mp3")} />
              <Action
                title="Open Extension Preferences"
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Download M4A"
          subtitle="Original quality audio where available"
          icon={Icon.Music}
          actions={
            <ActionPanel>
              <Action title="Download M4A" onAction={() => media("m4a")} />
              <Action
                title="Open Extension Preferences"
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Download MP4"
          subtitle="Video with audio"
          icon={Icon.Video}
          actions={
            <ActionPanel>
              <Action title="Download MP4" onAction={() => media("mp4")} />
              <Action
                title="Open Extension Preferences"
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      </List.Section>
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
