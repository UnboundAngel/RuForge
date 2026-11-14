import sponsorblockSvg from "../../assets/sponsorblock.svg";

/** Bundled SponsorBlock logo (homarr dashboard-icons). */
export function SponsorBlockIcon({ className = "", size = 28 }: { className?: string; size?: number }) {
  return (
    <img
      src={sponsorblockSvg}
      alt=""
      className={`object-contain ${className}`}
      width={size}
      height={size}
      draggable={false}
      aria-hidden
    />
  );
}
