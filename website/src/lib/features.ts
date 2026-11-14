import data from '../content/features.json';

export interface FeatureRow {
  name: string;
  what: string;
  since?: string;
}

export interface FeatureArea {
  id: string;
  title: string;
  features: FeatureRow[];
}

export interface FeatureCatalogue {
  updated: string;
  version: string;
  areas: FeatureArea[];
}

export const FEATURES = data as FeatureCatalogue;

export const FEATURE_HEADERS = ['Feature', 'What it does', 'Since'];

export function featureTableRows(area: FeatureArea): string[][] {
  return area.features.map((f) => [f.name, f.what, f.since ? `v${f.since}` : '']);
}

export const FEATURES_TEXT_PATH = '/features.txt';

export function featureCount(catalogue: FeatureCatalogue = FEATURES): number {
  return catalogue.areas.reduce((sum, area) => sum + area.features.length, 0);
}

export function formatUpdated(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Plain-text twin of the page, one block per area, for agents and scrapers. */
export function featuresToText(catalogue: FeatureCatalogue = FEATURES): string {
  const lines = [
    'RuForge features',
    '',
    `Updated ${catalogue.updated}, version ${catalogue.version}. ${featureCount(catalogue)} features in ${catalogue.areas.length} areas.`,
    'Each line is: feature name, what it does, and the version it arrived in when known.',
  ];
  for (const area of catalogue.areas) {
    lines.push('', area.title);
    for (const row of area.features) {
      lines.push(`- ${row.name}: ${row.what}${row.since ? ` (since ${row.since})` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
