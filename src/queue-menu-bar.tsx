import {
  Icon,
  LaunchType,
  MenuBarExtra,
  launchCommand,
  open,
  showInFinder,
} from "@raycast/api";
import { preferences } from "./preferences";
import {
  cancelJob,
  isActive,
  queueFolder,
  readJobs,
  startWorker,
  workerProcess,
} from "./jobs";
import { jobIcon, jobSubtitle } from "./queue";

export { runQueueWorker } from "./jobs";

/** Jobs that finished this recently stay in the menu. */
const recentMinutes = 15;

export default function Command() {
  const folder = queueFolder(preferences());
  const jobs = readJobs(folder);
  const active = jobs.filter(isActive);
  const recent = jobs
    .filter(
      (job) =>
        !isActive(job) &&
        Date.now() - (job.finishedAt ?? 0) < recentMinutes * 60_000,
    )
    .slice(0, 5);
  if (active.some((job) => job.status === "queued") && !workerProcess(folder))
    startWorker(folder);
  if (!active.length && !recent.length) return null;

  const running = active.find((job) => job.status === "running");
  const waiting = active.length - (running ? 1 : 0);
  const showQueue = () =>
    launchCommand({
      name: "transcription-queue",
      type: LaunchType.UserInitiated,
    });

  return (
    <MenuBarExtra
      icon={active.length ? Icon.Waveform : Icon.CheckCircle}
      title={
        [
          running?.percent !== undefined ? `${running.percent}%` : "",
          running && waiting ? `+${waiting}` : "",
          !running && active.length ? `${active.length}` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      tooltip="YouTube Subtitles & Transcription Queue"
    >
      {active.length > 0 && (
        <MenuBarExtra.Section title="In Progress">
          {active.map((job) => (
            <MenuBarExtra.Item
              key={job.id}
              icon={jobIcon(job)}
              title={job.title}
              subtitle={jobSubtitle(job)}
              tooltip="Click to show the queue, or hold ⌥ to cancel"
              onAction={showQueue}
              alternate={
                <MenuBarExtra.Item
                  icon={Icon.XMarkCircle}
                  title={`Cancel ${job.title}`}
                  onAction={() => cancelJob(folder, job)}
                />
              }
            />
          ))}
        </MenuBarExtra.Section>
      )}
      {recent.length > 0 && (
        <MenuBarExtra.Section title="Finished">
          {recent.map((job) => {
            const output = job.folder ?? job.outputs?.[0];
            return (
              <MenuBarExtra.Item
                key={job.id}
                icon={jobIcon(job)}
                title={job.title}
                subtitle={jobSubtitle(job)}
                tooltip={
                  output
                    ? "Click to open, or hold ⌥ to show in Finder"
                    : undefined
                }
                onAction={output ? () => open(output) : showQueue}
                alternate={
                  output ? (
                    <MenuBarExtra.Item
                      icon={Icon.Finder}
                      title={`Show ${job.title} in Finder`}
                      onAction={() => showInFinder(output)}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Show Queue"
          icon={Icon.List}
          onAction={showQueue}
        />
        {active.length > 1 && (
          <MenuBarExtra.Item
            title="Cancel All"
            icon={Icon.XMarkCircle}
            onAction={() => active.forEach((job) => cancelJob(folder, job))}
          />
        )}
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
