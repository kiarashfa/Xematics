// Single source of truth for site-wide settings. Every page and the Astro config read from here.

export const SITE = {
  name: 'Xematics',
  description: 'Publication-quality neural network diagrams from simple input.',
  /** Origin the site is served from (no trailing slash). */
  url: 'https://kiarashfa.github.io',
  /** Path prefix of the GitHub project page. Change to '/' for a custom domain. */
  basePath: '/Xematics/',
  repoUrl: 'https://github.com/kiarashfa/Xematics',
  analytics: {
    ga4MeasurementId: 'G-LW5F9VRHYL',
    /** Stays false until the consent banner ships; GA must never load without consent. */
    enabled: false,
  },
} as const;
