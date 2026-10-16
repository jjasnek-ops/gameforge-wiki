/** Legacy fixture defaults. Generated sites derive this file from game.config.json. */
export const gameforgeEnabled = false;
export const indexedLanguages: string[] = ['en', 'ja'];
export const features = {
  comments: false, adsense: false, adsterra: false, affiliates: false,
  advancedVideo: false, multilingual: true, analytics: false,
};
export const homepageInfo: {
  intro: string; heroImage?: string; heroAlt?: string;
  facts: Array<{ label: string; value: string; sourceUrl: string }>;
  sourcesLabel: string;
} = { intro: '', facts: [], sourcesLabel: 'Sources' };

export const templateCredit = { enabled: false, label: '', url: '' };
