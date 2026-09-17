import { preferences } from "./preferences";
import { QueueList } from "./queue";

export { runQueueWorker } from "./jobs";

export default function Command() {
  return <QueueList settings={preferences()} />;
}
