// Single source of truth for site-wide settings. Every page and the Astro config read from here.

export const SITE = {
  name: 'Xematics',
  tagline: 'Neural network diagrams for papers',
  description: 'Publication-quality neural network diagrams from simple input.',
  /** Origin the site is served from (no trailing slash). */
  url: 'https://kiarashfa.github.io',
  /** Path prefix of the GitHub project page. Change to '/' for a custom domain. */
  basePath: '/Xematics/',
  repoUrl: 'https://github.com/kiarashfa/Xematics',
  analytics: {
    ga4MeasurementId: 'G-LW5F9VRHYL',
    /** GA loads only after the visitor accepts in the consent bar (components/ConsentBar.astro). */
    enabled: true,
  },
} as const;
