import { renderSVG } from "uqr";

export function companionQrSvg(text: string): string {
  return renderSVG(text, {
    pixelSize: 8,
    whiteColor: "#f5ede4",
    blackColor: "#1c1512",
    ecc: "H",
    border: 4,
  });
}
