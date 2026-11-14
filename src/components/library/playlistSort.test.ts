import { describe, expect, it } from "vitest";
import type { PlaylistCollection } from "@/types";
import { sortPlaylists } from "./playlistSort";

const pl = (path: string, title: string, itemCount: number, created = 0): PlaylistCollection =>
  ({ path, title, itemCount, items: [{ created }] }) as unknown as PlaylistCollection;

const list = [
  pl("C:/b", "Beta", 2, 50),
  pl("virtual:watch-later", "Watch later", 0, 1),
  pl("C:/a", "alpha", 9, 10),
  pl("virtual:x", "Zed", 4, 5),
];
const paths = (m: Parameters<typeof sortPlaylists>[1], played: (p: string) => number | null = () => null) =>
  sortPlaylists(list, m, played).map((p) => p.path);

describe("sortPlaylists", () => {
  it("pins Watch later and puts video playlists before folders by default", () => {
    expect(paths("recent")).toEqual(["virtual:watch-later", "virtual:x", "C:/b", "C:/a"]);
  });
  it("sorts by name ignoring case", () => {
    expect(paths("name")).toEqual(["virtual:watch-later", "C:/a", "C:/b", "virtual:x"]);
  });
  it("sorts by size", () => {
    expect(paths("size")).toEqual(["virtual:watch-later", "C:/a", "virtual:x", "C:/b"]);
  });
  it("sorts by last played with never played last", () => {
    const played = (p: string) => (p === "C:/b" ? 100 : p === "virtual:x" ? 200 : null);
    expect(paths("played", played)).toEqual(["virtual:watch-later", "virtual:x", "C:/b", "C:/a"]);
  });
});
