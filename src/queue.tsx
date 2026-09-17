import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Icon,
  Image,
  Keyboard,
  LaunchType,
  List,
  Toast,
  launchCommand,
  open,
  showInFinder,
  showToast,
} from "@raycast/api";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { useEffect, useRef, useState } from "react";
import { Settings, formatDuration } from "./core";
import {
  Job,
  JobSpec,
  cancelJob,
  enqueue,
  isActive,
  queueFolder,
  readJobs,
  removeJob,
  retryJob,
  startWorker,
  workerProcess,
} from "./jobs";
import { TranscriptionOptions } from "./whisper";

/** Updates the menu bar item right away instead of at its next refresh. */
function refreshMenuBar() {
  launchCommand({ name: "queue-menu-bar", type: LaunchType.Background }).catch(
    () => undefined,
  );
}

/** What a job does, such as `transcription` or `MP4 download`. */
export function jobNoun(spec: JobSpec): string {
  switch (spec.kind) {
    case "file":
    case "video":
      return "transcription";
    case "playlist":
      return "subtitle download";
    case "media":
      return `${spec.format.toUpperCase()} download`;
  }
}

function capitalize(text: string): string {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

/** Adds jobs to the background queue and says so in a toast. */
export async function addToQueue(
  settings: Settings,
  jobs: { title: string; spec: JobSpec }[],
  showQueue?: () => void,
): Promise<Job[]> {
  const added = enqueue(settings, jobs);
  refreshMenuBar();
  const nouns = new Set(jobs.map((job) => jobNoun(job.spec)));
  const noun = nouns.size === 1 ? [...nouns][0] : "job";
  await showToast({
    style: Toast.Style.Success,
    title:
      jobs.length === 1
        ? `${capitalize(noun)} added to the queue`
        : `${jobs.length} ${noun}s added to the queue`,
    message: "The queue keeps running when you close Raycast.",
    primaryAction: showQueue
      ? { title: "Show Queue", onAction: showQueue }
      : undefined,
  });
  return added;
}

export function fileJobs(
  paths: string[],
  options: TranscriptionOptions,
): { title: string; spec: JobSpec }[] {
  return paths.map((path) => ({
    title: basename(path),
    spec: { kind: "file", path, options },
  }));
}

/**
 * The queue, read again every second. `onFinish` is called for jobs that
 * finish while it is shown.
 */
export function useQueue(settings: Settings, onFinish?: (job: Job) => void) {
  const folder = queueFolder(settings);
  const [jobs, setJobs] = useState(() => readJobs(folder));
  const last = useRef(JSON.stringify(jobs));
  const finish = useRef(onFinish);
  finish.current = onFinish;

  useEffect(() => {
    let restarted = 0;
    const timer = setInterval(() => {
      const next = readJobs(folder);
      const text = JSON.stringify(next);
      if (text === last.current) return;
      const previous = new Map(
        (JSON.parse(last.current) as Job[]).map((job) => [job.id, job]),
      );
      last.current = text;
      setJobs(next);
      for (const job of next)
        if (!isActive(job) && previous.get(job.id)?.status === "running")
          finish.current?.(job);
      if (
        next.some((job) => job.status === "queued") &&
        !workerProcess(folder) &&
        Date.now() - restarted > 10_000
      ) {
        restarted = Date.now();
        startWorker(folder);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [folder]);

  return {
    folder,
    jobs,
    refresh() {
      const next = readJobs(folder);
      last.current = JSON.stringify(next);
      setJobs(next);
    },
  };
}

export function jobIcon(job: Job): Image.ImageLike {
  switch (job.status) {
    case "running": {
      const percent = job.percent ?? 0;
      return {
        source:
          percent >= 100
            ? Icon.CircleProgress100
            : percent >= 75
              ? Icon.CircleProgress75
              : percent >= 50
                ? Icon.CircleProgress50
                : percent >= 25
                  ? Icon.CircleProgress25
                  : Icon.CircleProgress,
        tintColor: Color.Blue,
      };
    }
    case "queued":
      return Icon.Clock;
    case "done":
      return { source: Icon.CheckCircle, tintColor: Color.Green };
    case "failed":
      return { source: Icon.XMarkCircle, tintColor: Color.Red };
    default:
      return { source: Icon.MinusCircle, tintColor: Color.SecondaryText };
  }
}

export function jobSubtitle(job: Job): string {
  switch (job.status) {
    case "running":
      return job.progress || "Starting…";
    case "queued":
      return "Waiting";
    case "done":
      if (job.spec.kind === "playlist")
        return [
          `${job.outputs?.length ?? 0} ${job.outputs?.length === 1 ? "subtitle" : "subtitles"} saved`,
          job.skipped?.length ? `${job.skipped.length} skipped` : "",
        ]
          .filter(Boolean)
          .join(", ");
      return job.outputs?.length === 1
        ? basename(job.outputs[0])
        : `${job.outputs?.length ?? 0} files saved`;
    case "failed":
      return job.error || "Failed";
    default:
      return job.outputs?.length
        ? `Canceled after ${job.outputs.length} saved`
        : "Canceled";
  }
}

function doneTitle(job: Job): string {
  const count = job.outputs?.length ?? 0;
  switch (job.spec.kind) {
    case "playlist":
      return `Subtitles saved for ${job.title}`;
    case "media": {
      const format = job.spec.format.toUpperCase();
      return count > 1 ? `${count} ${format} files saved` : `${format} saved`;
    }
    default:
      return count > 1
        ? `${count} transcriptions saved`
        : "Transcription saved";
  }
}

export function jobToast(job: Job, showQueue?: () => void) {
  const output = job.folder ?? job.outputs?.[0];
  showToast(
    job.status === "done"
      ? {
          style: Toast.Style.Success,
          title: doneTitle(job),
          message: job.spec.kind === "playlist" ? jobSubtitle(job) : output,
          primaryAction: !output
            ? undefined
            : job.spec.kind === "media"
              ? {
                  title: "Show in Finder",
                  onAction: () => showInFinder(output),
                }
              : { title: "Open", onAction: () => open(output) },
        }
      : job.status === "failed"
        ? {
            style: Toast.Style.Failure,
            title: `${capitalize(jobNoun(job.spec))} failed: ${job.title}`,
            message: job.error,
            primaryAction: showQueue
              ? { title: "Show Queue", onAction: showQueue }
              : undefined,
          }
        : { style: Toast.Style.Success, title: `Canceled ${job.title}` },
  );
}

/** Running, queued and finished jobs, with actions to cancel, retry and open results. */
export function QueueList({ settings }: { settings: Settings }) {
  const { folder, jobs, refresh } = useQueue(settings);
  const active = jobs.filter(isActive);
  const finished = jobs.filter((job) => !isActive(job));

  const cancelAll = (
    <Action
      title="Cancel All"
      icon={Icon.XMarkCircle}
      style={Action.Style.Destructive}
      shortcut={Keyboard.Shortcut.Common.RemoveAll}
      onAction={() => {
        active.forEach((job) => cancelJob(folder, job));
        refresh();
      }}
    />
  );
  const clearFinished = (
    <Action
      title="Clear Finished"
      icon={Icon.Trash}
      shortcut={Keyboard.Shortcut.Common.RemoveAll}
      onAction={() => {
        finished.forEach((job) => removeJob(folder, job));
        refresh();
      }}
    />
  );

  const item = (job: Job) => {
    const output = job.spec.kind === "playlist" ? undefined : job.outputs?.[0];
    const savedFolder = job.folder;
    const source = job.spec.kind === "file" ? job.spec.path : undefined;
    const elapsed =
      job.startedAt &&
      formatDuration(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000);
    return (
      <List.Item
        key={job.id}
        title={job.title}
        subtitle={jobSubtitle(job)}
        icon={jobIcon(job)}
        accessories={[
          ...(job.status === "running" && job.percent !== undefined
            ? [{ tag: { value: `${job.percent}%`, color: Color.Blue } }]
            : []),
          ...(elapsed && job.status !== "queued"
            ? [{ text: elapsed, tooltip: "Time taken" }]
            : []),
          ...(job.finishedAt ? [{ date: new Date(job.finishedAt) }] : []),
        ]}
        actions={
          <ActionPanel>
            {isActive(job) ? (
              <ActionPanel.Section>
                <Action
                  title={
                    job.status === "queued"
                      ? "Remove from Queue"
                      : jobNoun(job.spec) === "transcription"
                        ? "Cancel Transcription"
                        : "Cancel Download"
                  }
                  icon={Icon.XMarkCircle}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                  onAction={() => {
                    cancelJob(folder, job);
                    refresh();
                  }}
                />
                {active.length > 1 && cancelAll}
              </ActionPanel.Section>
            ) : (
              <ActionPanel.Section>
                {output && job.spec.kind === "media" && (
                  <>
                    <Action.Open title="Open File" target={output} />
                    <Action.ShowInFinder path={output} />
                  </>
                )}
                {output && job.spec.kind !== "media" && (
                  <>
                    <Action.Open title="Open Transcript" target={output} />
                    <Action.ShowInFinder path={output} />
                    <Action
                      title="Copy Transcript"
                      icon={Icon.CopyClipboard}
                      shortcut={Keyboard.Shortcut.Common.Copy}
                      onAction={async () => {
                        await Clipboard.copy(readFileSync(output, "utf8"));
                        await showToast({ title: "Transcript copied" });
                      }}
                    />
                  </>
                )}
                {savedFolder && (
                  <>
                    <Action.Open title="Open Folder" target={savedFolder} />
                    <Action.ShowInFinder path={savedFolder} />
                  </>
                )}
                {job.skipped && job.skipped.length > 0 && (
                  <Action.CopyToClipboard
                    title="Copy Skipped Videos"
                    content={job.skipped
                      .map((video) => `${video.title}: ${video.reason}`)
                      .join("\n")}
                  />
                )}
                {(job.status !== "done" || job.spec.kind === "playlist") && (
                  <Action
                    title={
                      job.status === "done"
                        ? "Download New Videos"
                        : "Try Again"
                    }
                    icon={Icon.RotateClockwise}
                    onAction={() => {
                      retryJob(settings, job);
                      removeJob(folder, job);
                      refreshMenuBar();
                      refresh();
                    }}
                  />
                )}
                {job.error && (
                  <Action.CopyToClipboard
                    title="Copy Error"
                    content={job.error}
                  />
                )}
                <Action
                  title="Remove from List"
                  icon={Icon.Trash}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                  onAction={() => {
                    removeJob(folder, job);
                    refresh();
                  }}
                />
                {clearFinished}
              </ActionPanel.Section>
            )}
            {source && (
              <ActionPanel.Section>
                <Action.ShowInFinder
                  title="Show Original in Finder"
                  path={source}
                />
              </ActionPanel.Section>
            )}
          </ActionPanel>
        }
      />
    );
  };

  return (
    <List navigationTitle="Queue">
      <List.EmptyView
        icon={Icon.Waveform}
        title="Nothing in the queue"
        description="Transcriptions and downloads you start appear here. They keep running when you close Raycast."
      />
      <List.Section title="Running">
        {jobs.filter((job) => job.status === "running").map(item)}
      </List.Section>
      <List.Section
        title="Queued"
        subtitle={
          jobs.some((job) => job.status === "queued")
            ? `${jobs.filter((job) => job.status === "queued").length}`
            : undefined
        }
      >
        {jobs.filter((job) => job.status === "queued").map(item)}
      </List.Section>
      <List.Section title="Finished">{finished.map(item)}</List.Section>
    </List>
  );
}
