import {
  Clipboard,
  List,
  Toast,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import {
  MediaFormat,
  Settings,
  Video,
  VideoPreview,
  fetchPreview,
  formatDuration,
  isYoutubeLink,
  pastedFilePath,
  pastedYoutubeLink,
  youtubeThumbnail,
} from "./core";

export const mediaFormats: { value: MediaFormat; subtitle: string }[] = [
  { value: "mp3", subtitle: "Best audio, highest MP3 quality" },
  { value: "m4a", subtitle: "Best audio as M4A" },
  { value: "mp4", subtitle: "Best video with audio" },
];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type VideoState = {
  video?: Video;
  preview: VideoPreview;
  error?: string;
  retry: () => void;
};

type Loaded = Omit<VideoState, "retry"> & { url: string };

/** Loads video details with yt-dlp and shows a quick YouTube preview in the meantime. */
export function useVideo(
  url: string | undefined,
  settings: Settings,
  load: (
    url: string,
    settings: Settings,
    signal: AbortSignal,
  ) => Promise<Video>,
): VideoState {
  const [state, setState] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const update = (change: (current: Loaded) => Partial<Loaded>) =>
      setState((current) =>
        current?.url === url && !controller.signal.aborted
          ? { ...current, ...change(current) }
          : current,
      );
    setState({ url, preview: { thumbnail: youtubeThumbnail(url) } });
    fetchPreview(url, controller.signal).then(
      (value) =>
        update((current) => ({ preview: { ...current.preview, ...value } })),
      () => undefined,
    );
    load(url, settings, controller.signal).then(
      (video) => update(() => ({ video })),
      (reason) => {
        if (controller.signal.aborted) return;
        update(() => ({ error: errorMessage(reason) }));
        showToast({
          style: Toast.Style.Failure,
          title: "Could not inspect video",
          message: errorMessage(reason),
          primaryAction: /Browser Sign-In/.test(errorMessage(reason))
            ? {
                title: "Open Extension Preferences",
                onAction: openExtensionPreferences,
              }
            : undefined,
        });
      },
    );
    return () => controller.abort();
  }, [url, attempt]);

  const current = state?.url === url ? state : undefined;
  return {
    video: current?.video,
    preview: current?.preview ?? {
      thumbnail: url ? youtubeThumbnail(url) : undefined,
    },
    error: current?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>~#]/g, "\\$&");
}

type Fact = { title: string; text: string };

/** Detail markdown: an optional image and title first, with facts listed well below them. */
export function detailMarkdown({
  image,
  title,
  note,
  facts = [],
}: {
  image?: string;
  title?: string;
  note?: string;
  facts?: Fact[];
}): string {
  return [
    image &&
      `![Thumbnail](${image.replace(/[()\s]/g, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)})`,
    title && `## ${escapeMarkdown(title)}`,
    note,
    facts.length > 0 && "---",
    facts
      .map((fact) => `- **${fact.title}:** ${escapeMarkdown(fact.text)}`)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Thumbnail and title first, with video facts and item details listed well below them. */
export function videoDetail(
  { video, preview, error }: Pick<VideoState, "video" | "preview" | "error">,
  details: Fact[] = [],
) {
  const channel = video?.channel || preview.channel;
  const title = video?.title || preview.title;
  const markdown = detailMarkdown({
    image: video?.thumbnail || preview.thumbnail,
    title,
    note: error
      ? `**Could not inspect video:** ${escapeMarkdown(error)}`
      : title
        ? undefined
        : "Loading video details…",
    facts: [
      ...(channel ? [{ title: "Channel", text: channel }] : []),
      ...(video?.duration !== undefined
        ? [{ title: "Duration", text: formatDuration(video.duration) }]
        : []),
      ...(video?.uploadDate
        ? [{ title: "Uploaded", text: video.uploadDate }]
        : []),
      ...details,
    ],
  });
  return <List.Item.Detail markdown={markdown} />;
}

/**
 * Search text that doubles as the link field: a YouTube link in the clipboard is
 * searched on launch, pasting a YouTube link searches it right away, and pasting
 * a file path calls onFile.
 */
export function useLinkSearch(
  onLink: (link: string) => void,
  onFile: (text: string) => void,
) {
  const [text, setText] = useState("");
  const previous = useRef("");

  useEffect(() => {
    Clipboard.readText().then(
      (clipboard) => {
        const link = clipboard?.trim();
        if (!link || previous.current || !isYoutubeLink(link)) return;
        previous.current = link;
        setText(link);
        onLink(link);
      },
      () => undefined,
    );
  }, []);

  return {
    text,
    /** Replaces the search text with a link and loads it. */
    open(link: string) {
      previous.current = link;
      setText(link);
      onLink(link);
    },
    onChange(next: string) {
      const link = pastedYoutubeLink(previous.current, next);
      const file = link ? undefined : pastedFilePath(previous.current, next);
      previous.current = link ?? file ?? next;
      setText(previous.current);
      if (link) onLink(link);
      else if (file) onFile(file);
    },
  };
}
