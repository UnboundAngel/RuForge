import { PanelEmptyState } from "./PanelEmptyState";

type Props = {
  hasChannels: boolean;
  onFollowChannel: () => void;
};

export function NotificationEmpty({ hasChannels, onFollowChannel }: Props) {
  return (
    <PanelEmptyState
      icon="tabler:bell"
      title="Nothing new"
      body="New uploads from channels you follow and your finished downloads land here."
      action={{ label: hasChannels ? "Manage channels" : "Follow a channel", onClick: onFollowChannel }}
    />
  );
}
