import { addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
import navIconCollections from "@/lib/navIconCollections.json";

let registered = false;

export function registerNavIcons(): void {
  if (registered) return;
  registered = true;
  for (const pack of navIconCollections as unknown as IconifyJSON[]) {
    addCollection(pack);
  }
}

registerNavIcons();
