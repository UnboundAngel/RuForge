import { describe, expect, it } from "vitest";
import {
  MUSIC_ALBUM_CARD_WIDTH_MD_PX,
  MUSIC_ALBUM_SHELF_GAP_HOME_PX,
  MUSIC_ALBUM_SHELF_GAP_RECENT_PX,
  musicAlbumShelfFitCount,
} from "./musicAlbumShelfLayout";

describe("musicAlbumShelfFitCount", () => {
  it("fits whole cards only", () => {
    expect(
      musicAlbumShelfFitCount(960, MUSIC_ALBUM_CARD_WIDTH_MD_PX, MUSIC_ALBUM_SHELF_GAP_RECENT_PX),
    ).toBe(5);
    expect(
      musicAlbumShelfFitCount(959, MUSIC_ALBUM_CARD_WIDTH_MD_PX, MUSIC_ALBUM_SHELF_GAP_RECENT_PX),
    ).toBe(4);
  });

  it("always returns at least one", () => {
    expect(musicAlbumShelfFitCount(0, MUSIC_ALBUM_CARD_WIDTH_MD_PX, MUSIC_ALBUM_SHELF_GAP_HOME_PX)).toBe(1);
  });
});
