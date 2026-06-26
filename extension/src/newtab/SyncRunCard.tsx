import { AgentActivityFeed } from "../components/AgentActivityFeed";

type Props = {
  running: boolean;
  streamingItemCount?: number;
  seed?: import("../storage/schema").ActivityEntry[];
  startedAt?: string;
  onStop: () => void;
  onOpenDetails: () => void;
};

export function SyncRunCard({
  running,
  streamingItemCount = 0,
  seed = [],
  startedAt,
  onStop,
  onOpenDetails,
}: Props) {
  return (
    <AgentActivityFeed
      active={running}
      seed={seed}
      title="Digest run"
      startedAt={startedAt}
      streamingItemCount={streamingItemCount}
      onStop={() => void onStop()}
      onOpenDetails={onOpenDetails}
      className="mx-3 mt-2 text-[11px]"
      maxHeight="max-h-48"
    />
  );
}
