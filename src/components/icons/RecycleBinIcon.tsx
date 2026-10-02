type Props = {
  size?: number;
  className?: string;
};

/** Bin with a recycle loop, stroked to sit beside lucide icons. */
export function RecycleBinIcon({ size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <path d="M5 6l1.1 13.2A2 2 0 0 0 8.1 21h7.8a2 2 0 0 0 2-1.8L19 6" />
      <path d="M9 13.5a3 3 0 0 1 5.2-2" />
      <path d="M14.6 9.6v2h-2" />
      <path d="M15 14.5a3 3 0 0 1-5.2 2" />
      <path d="M9.4 18.4v-2h2" />
    </svg>
  );
}
