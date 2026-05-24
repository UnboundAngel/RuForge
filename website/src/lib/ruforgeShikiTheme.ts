import type { ThemeRegistration } from 'shiki';

/** Warm gold/bronze Shiki theme aligned with rf-* site tokens. */
export const ruforgeShikiTheme: ThemeRegistration = {
  name: 'ruforge',
  displayName: 'RuForge',
  type: 'dark',
  bg: '#1a1412',
  fg: '#edd79c',
  settings: [
    { settings: { foreground: '#edd79c' } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: '#8a7355', fontStyle: 'italic' },
    },
    {
      scope: ['string', 'constant.other.symbol', 'constant.other.key'],
      settings: { foreground: '#d4a373' },
    },
    {
      scope: [
        'keyword',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.operator.new',
      ],
      settings: { foreground: '#c9956a', fontStyle: 'bold' },
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function'],
      settings: { foreground: '#e8c078' },
    },
    {
      scope: ['variable', 'entity.name.variable', 'meta.definition.variable'],
      settings: { foreground: '#edd79c' },
    },
    {
      scope: ['constant.numeric', 'constant.language'],
      settings: { foreground: '#b8894f' },
    },
    {
      scope: ['entity.name.type', 'support.type', 'entity.other.inherited-class'],
      settings: { foreground: '#ddb86a' },
    },
    {
      scope: ['punctuation', 'meta.brace'],
      settings: { foreground: '#c9b87a' },
    },
    {
      scope: ['entity.name.tag', 'support.class.component'],
      settings: { foreground: '#e0b86a' },
    },
    {
      scope: ['entity.other.attribute-name'],
      settings: { foreground: '#d9ae72' },
    },
  ],
};
