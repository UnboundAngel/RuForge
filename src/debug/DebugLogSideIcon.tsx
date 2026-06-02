import type { DebugLogSide } from "./debugCategories";

type Props = {
  side: DebugLogSide;
  className?: string;
};

/** Small brand marks for where logs originate (not Lucide generic file icons). */
export function DebugLogSideIcon({ side, className = "w-3.5 h-3.5 shrink-0" }: Props) {
  switch (side) {
    case "rust":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#DEA584"
            d="M12 2c-.6 0-1.1.4-1.2 1C8.5 2.5 6.5 4 5.5 6.2 3.8 6.4 2 8 2 10c0 1.2.5 2.3 1.3 3-.8 1.5-.5 3.4.7 4.6 1.1 1.1 2.8 1.3 4.1.5.9 1.5 2.5 2.5 4.4 2.5 2.6 0 4.8-2 4.9-4.6 1.5-.9 2.5-2.6 2.5-4.5 0-2.2-1.8-4-4-4.1-.3-2.4-2.4-4.3-5-4.3zm0 1.8c1.8 0 3.2 1.4 3.2 3.2 0 .3 0 .6-.1.9l-.5-.2c-.4-.1-.8-.2-1.2-.2-1 0-1.9.4-2.6 1.1l-.8-.5c.5-1.5 1.9-2.5 3.5-2.5zM6.8 8.4c.8 0 1.5.3 2 .8l-.7 1.1c-.4-.3-.9-.5-1.4-.5-.6 0-1.1.2-1.5.6l-.9-.7c.6-.8 1.5-1.3 2.5-1.3zm8.4 0c1 0 1.9.5 2.5 1.3l-.9.7c-.4-.4-.9-.6-1.5-.6-.5 0-1 .2-1.4.5l-.7-1.1c.5-.5 1.2-.8 2-.8z"
          />
        </svg>
      );
    case "typescript":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="2" fill="#3178C6" />
          <path
            fill="#fff"
            d="M13.5 10.2v5.5c0 .9-.5 1.3-1.2 1.3-.7 0-1.2-.4-1.2-1.1h-1.4c.1 1.5 1.1 2.4 2.7 2.4 1.6 0 2.7-.9 2.7-2.5v-5.6h-1.6zm-4.2 0H7.2v7.2H5.8v-7.2H4.4v-1.3h5v1.3z"
          />
        </svg>
      );
    case "javascript":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden>
          <rect width="24" height="24" rx="2" fill="#F7DF1E" />
          <path
            fill="#000"
            d="M7.5 18.5c.6.9 1.5 1.6 2.8 1.6 1.4 0 2.3-.7 2.3-1.7 0-1.1-.9-1.5-2.4-2.1l-.8-.3c-1.2-.4-2-1-2-2.2 0-1.2 1-2.1 2.5-2.1 1.1 0 1.9.4 2.5 1.2l-1.4 1c-.4-.7-1-.9-1.6-.9-.9 0-1.5.6-1.5 1.3 0 .8.5 1.2 1.7 1.7l.8.3c1.4.6 2.2 1.2 2.2 2.4 0 1.4-1.1 2.2-2.8 2.2-1.6 0-2.7-.8-3.2-1.9l1.7-1zM14.2 18.7h1.6l1.2-4.1.1.1.9 4.1h1.5l2-7.2h-1.6l-1.1 4.4-.1-.1-.9-4.4h-1.5l-1 4.3-.1.1-.9-4.4h-1.6l2 7.2z"
          />
        </svg>
      );
    default:
      return null;
  }
}
