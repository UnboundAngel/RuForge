import { Icon } from "@iconify/react";

export function NotificationEmpty({ onFollowChannel }: { onFollowChannel: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon icon="tabler:bell" width={22} height={22} className="text-stone-600" aria-hidden />
      <p className="text-[13px] font-semibold text-stone-300">You're all caught up.</p>
      <button
        type="button"
        onClick={onFollowChannel}
        className="text-[12px] font-semibold text-[color:var(--accent)] transition-[filter] duration-150 hover:brightness-110"
      >
        Follow a channel
      </button>
    </div>
  );
}
