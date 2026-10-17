import { openGameTag } from "@games";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { openTagPage } from "../creatorPageStore";

/** Every tag link goes through here: game tags open their game page on Videos, plain tags their library page. */
export function openTag(tagId: string): void {
  const store = useRuforgeStore.getState();
  if (store.navMode === "music") store.setNavMode("default");
  if (openGameTag(tagId)) return;
  store.setActiveTab("media");
  openTagPage(tagId);
}
