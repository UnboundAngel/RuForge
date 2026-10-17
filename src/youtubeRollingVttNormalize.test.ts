import { describe, expect, it } from "vitest";
import { normalizeYoutubeRollingVttIfNeeded } from "./youtubeRollingVttNormalize";

const ROLLING = `WEBVTT
Kind: captions
Language: en

00:00:00.080 --> 00:00:02.389 align:start position:0%
 
And<00:00:00.320><c> so</c><00:00:00.880><c> an</c>

00:00:02.389 --> 00:00:02.399 align:start position:0%
And so an
 

00:00:02.399 --> 00:00:04.150 align:start position:0%
And so an
allegation<00:00:02.720><c> came</c><00:00:03.000><c> out.</c>

00:00:04.150 --> 00:00:04.160 align:start position:0%
allegation came out.
 

00:00:04.160 --> 00:00:09.000 align:start position:0%
allegation came out.
People<00:00:04.400><c> with</c><00:00:04.600><c> a</c><00:00:04.800><c> brain</c><00:00:05.000><c> will</c><00:00:05.200><c> wait</c><00:00:05.400><c> to</c><00:00:05.600><c> see</c><00:00:05.800><c> some</c><00:00:06.000><c> real</c><00:00:06.200><c> proof</c>
`;

describe("normalizeYoutubeRollingVttIfNeeded", () => {
  it("pops a whole sentence on at its first word", () => {
    const out = normalizeYoutubeRollingVttIfNeeded(ROLLING);
    expect(out).toContain("00:00:00.080 --> 00:00:04.160\nAnd so an allegation came out.\n");
  });

  it("splits long blocks into two balanced lines and never overlaps cues", () => {
    const out = normalizeYoutubeRollingVttIfNeeded(ROLLING);
    expect(out).toContain("00:00:04.160 --> 00:00:07.600\nPeople with a brain will\nwait to see some real proof\n");
    expect(out.match(/-->/g)).toHaveLength(2);
  });

  it("leaves uploaded captions untouched", () => {
    const manual = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n";
    expect(normalizeYoutubeRollingVttIfNeeded(manual)).toBe(manual);
  });
});
