import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// simple-engine evaluates this file from a data: URL, so bare package imports fail; resolve
// @startica/brand from the site's folder (scripts run with it as the working directory).
const brand = createRequire(`${process.cwd()}/`).resolve('@startica/brand/logo');
const { logoSvg, markSvg } = await import(pathToFileURL(brand).href);

export default {
  site: {
    // The wordmark and S mark as inline SVG (currentColor), from packages/brand. Decorative: the
    // surrounding links carry the accessible name.
    logo: logoSvg({ title: null }),
    mark: markSvg({ title: null }),
    title: 'Startica',
    url: 'https://mystartica.com',
    description:
      'Startica is an open-source AI co-founder for everything after you ship. It finds the people who need your product, drafts replies, posts and ads in your voice, gets you found in search and AI answers, and keeps your site accessible and secure. It runs on your desktop, and you approve everything.',
    author: 'Christopher Casper',
    language: 'en',
    repo: 'https://github.com/chriscasper/startica',
    docs: 'https://docs.mystartica.com',
    email: 'hello@mystartica.com',
    nav: [
      { title: 'Features', url: '/#features' },
      { title: 'Docs', url: 'https://docs.mystartica.com' },
      { title: 'Changelog', url: '/changelog' },
      { title: 'Community', url: '/community' },
    ],
  },
  paths: {
    content: './content',
    layouts: './layouts',
    output: './dist',
    styles: './styles',
    static: './public',
  },
  collections: {},
  seo: {
    sitemap: true,
    rss: false,
    robots: true,
    llmsTxt: true,
    rawMarkdown: true,
    jsonLd: true,
    aiCrawlers: {
      allow: true,
    },
  },
  markdown: {
    options: {
      html: true,
      linkify: true,
      typographer: true,
    },
    shiki: {
      theme: 'github-dark',
    },
  },
  dev: {
    port: 9000,
    open: false,
  },
};
