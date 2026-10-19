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
      'The open-source startup harness. Startica is a harness for your own AI model: it researches your market, finds the conversations, drafts the replies and ads, and checks your SEO, accessibility and security. You approve every move. It runs on your desktop.',
    author: 'Christopher Casper',
    language: 'en',
    repo: 'https://github.com/chriscasper/startica',
    docs: 'https://docs.mystartica.com',
    email: 'hello@mystartica.com',
    nav: [
      { title: 'Features', url: '/#features' },
      { title: 'Download', url: '/download' },
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
