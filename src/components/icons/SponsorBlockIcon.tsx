import sponsorblockSvg from "../../assets/sponsorblock.svg";

/** Bundled SponsorBlock logo (homarr dashboard-icons). */
export function SponsorBlockIcon({ className = "" }: { className?: string }) {
  return (
    <img
      src={sponsorblockSvg}
      alt=""
      className={`w-7 h-7 object-contain ${className}`}
      width={28}
      height={28}
      draggable={false}
      aria-hidden
    />
  );
}
