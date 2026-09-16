import { Clipboard, List, Toast, showToast } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import {
  MediaFormat,
  Settings,
  Video,
  VideoPreview,
  fetchPreview,
  formatDuration,
  isYoutubeUrl,
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

/** Loads video details with yt-dlp and shows a quick YouTube preview in the meantime. */
export function useVideo(
  url: string,
  settings: Settings,
  load: (
    url: string,
    settings: Settings,
    signal: AbortSignal,
  ) => Promise<Video>,
): VideoState {
  const [video, setVideo] = useState<Video>();
  const [preview, setPreview] = useState<VideoPreview>({
    thumbnail: youtubeThumbnail(url),
  });
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPreview(url, controller.signal).then(
      (value) => setPreview((current) => ({ ...current, ...value })),
      () => undefined,
    );
    return () => controller.abort();
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    load(url, settings, controller.signal).then(setVideo, (reason) => {
      if (controller.signal.aborted) return;
      setError(errorMessage(reason));
      showToast({
        style: Toast.Style.Failure,
        title: "Could not inspect video",
        message: errorMessage(reason),
      });
    });
    return () => controller.abort();
  }, [url, attempt]);

  return {
    video,
    preview,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>~#]/g, "\\$&");
}

/** Thumbnail, title and video facts, followed by details about the selected item. */
export function videoDetail(
  { video, preview, error }: VideoState,
  details: { title: string; text: string }[] = [],
) {
  const thumbnail = video?.thumbnail || preview.thumbnail;
  const title = video?.title || preview.title;
  const channel = video?.channel || preview.channel;
  const markdown = [
    thumbnail &&
      `![Thumbnail](${thumbnail.replace(/[()\s]/g, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)})`,
    title ? `## ${escapeMarkdown(title)}` : !error && "Loading video details…",
    error && `**Could not inspect video:** ${escapeMarkdown(error)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          {channel && (
            <List.Item.Detail.Metadata.Label title="Channel" text={channel} />
          )}
          {video?.duration !== undefined && (
            <List.Item.Detail.Metadata.Label
              title="Duration"
              text={formatDuration(video.duration)}
            />
          )}
          {video?.uploadDate && (
            <List.Item.Detail.Metadata.Label
              title="Uploaded"
              text={video.uploadDate}
            />
          )}
          {details.length > 0 && (channel || video) && (
            <List.Item.Detail.Metadata.Separator />
          )}
          {details.map((detail) => (
            <List.Item.Detail.Metadata.Label
              key={detail.title}
              title={detail.title}
              text={detail.text}
            />
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

/**
 * A link text field that searches a YouTube link from the clipboard on launch
 * and searches again whenever a YouTube link is pasted.
 */
export function useLinkField(onLink: (url: string) => void, ready = true) {
  const [value, setValue] = useState("");
  const previous = useRef("");
  const checkedClipboard = useRef(false);

  useEffect(() => {
    if (!ready || checkedClipboard.current) return;
    checkedClipboard.current = true;
    Clipboard.readText().then(
      (text) => {
        const link = text?.trim();
        if (!link || previous.current || !isYoutubeUrl(link)) return;
        previous.current = link;
        setValue(link);
        onLink(link);
      },
      () => undefined,
    );
  }, [ready]);

  return {
    value,
    onChange(next: string) {
      const link = pastedYoutubeLink(previous.current, next);
      previous.current = link ?? next;
      setValue(link ?? next);
      if (link) onLink(link);
    },
  };
}
