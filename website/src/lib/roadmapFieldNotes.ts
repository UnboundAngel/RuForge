import roadmapJson from '../content/roadmap.json';

export type RoadmapArea =
  | 'Downloads'
  | 'Player'
  | 'Library'
  | 'Browser'
  | 'Settings'
  | 'Performance';

export type RoadmapStatus = 'shipped' | 'progress' | 'planned';

export type RoadmapPriority = 'essential' | 'high' | 'medium' | 'low';

export type RoadmapItem = {
  title: string;
  area: RoadmapArea;
  status: RoadmapStatus;
  priority: RoadmapPriority;
};

export type LegacyRoadmapEntry = {
  appArea: string;
  featureName: string;
  priority: string;
  status: 'Finished' | 'To-Do';
  /** Preferred Field Notes bucket when set. */
  roadmapStatus?: RoadmapStatus;
  phase?: 'progress' | 'planned';
};

const ARC_CIRCUMFERENCE = 34.56;

const PRIORITY_LEVEL: Record<RoadmapPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  essential: 4,
};

const PRIORITY_PCT = [0, 0.25, 0.5, 0.75, 1] as const;

const PRIORITY_LABEL: Record<RoadmapPriority, string> = {
  essential: 'Essential',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const AREA_MAP: Record<string, RoadmapArea> = {
  'Download Screen': 'Downloads',
  'Settings Screen': 'Settings',
  'Video Library': 'Library',
  'Music Library': 'Library',
  Infra: 'Performance',
  Explorer: 'Browser',
  Browser: 'Browser',
  Player: 'Player',
};

function mapArea(appArea: string): RoadmapArea {
  return AREA_MAP[appArea] ?? 'Settings';
}

function mapPriority(priority: string): RoadmapPriority {
  if (priority === 'Extremely important') return 'essential';
  if (priority === 'High') return 'high';
  if (priority === 'Medium') return 'medium';
  return 'low';
}

function mapStatus(entry: LegacyRoadmapEntry): RoadmapStatus {
  if (entry.roadmapStatus) return entry.roadmapStatus;
  if (entry.status === 'Finished') return 'shipped';
  if (entry.phase === 'progress') return 'progress';
  return 'planned';
}

export function transformRoadmapEntry(entry: LegacyRoadmapEntry): RoadmapItem {
  return {
    title: entry.featureName,
    area: mapArea(entry.appArea),
    status: mapStatus(entry),
    priority: mapPriority(entry.priority),
  };
}

export function loadRoadmapEntries(): LegacyRoadmapEntry[] {
  return roadmapJson as LegacyRoadmapEntry[];
}

export function transformRoadmapItems(entries: LegacyRoadmapEntry[]): RoadmapItem[] {
  return entries.map(transformRoadmapEntry);
}

export function priorityArcDasharray(priority: RoadmapPriority): string {
  const pct = PRIORITY_PCT[PRIORITY_LEVEL[priority]];
  const filled = (ARC_CIRCUMFERENCE * pct).toFixed(1);
  const gap = (ARC_CIRCUMFERENCE * (1 - pct)).toFixed(1);
  return `${filled} ${gap}`;
}

export function priorityLabel(priority: RoadmapPriority): string {
  return PRIORITY_LABEL[priority];
}
