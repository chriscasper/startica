import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// simple-engine evaluates this file from a data: URL, so bare package imports fail; resolve
// @startica/brand from the site's folder (scripts run with it as the working directory).
const brand = createRequire(`${process.cwd()}/`).resolve('@startica/brand/logo');
const { logoSvg, markSvg } = await import(pathToFileURL(brand).href);

// Sidebar order lives in `site.docsNav`: every page must be listed here to appear in the sidebar
// and in previous/next links. `yarn workspace @startica/docs check` fails if a page is missing or a link is broken.
const docsNav = [
  {
    title: 'Getting started',
    items: [
      { title: 'What is Startica', url: '/getting-started/what-is-startica' },
      { title: 'Requirements', url: '/getting-started/requirements' },
      { title: 'Install from source', url: '/getting-started/install' },
      { title: 'First run', url: '/getting-started/first-run' },
      { title: 'Try the demo', url: '/guides/demo-mode' },
      { title: 'Your first day', url: '/getting-started/first-day' },
      { title: 'Updating', url: '/getting-started/updating' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Finding conversations', url: '/guides/finding-conversations' },
      { title: 'Manual channels', url: '/guides/manual-channels' },
      { title: 'Drafting replies', url: '/guides/drafting-replies' },
      { title: 'Posting with Startica', url: '/guides/assisted-posting' },
      { title: 'Dashboard', url: '/guides/dashboard' },
      { title: 'Today', url: '/guides/today' },
      { title: 'Voice profiles', url: '/guides/voice-profiles' },
      { title: 'Content Studio', url: '/guides/content-studio' },
      { title: 'Roadmap', url: '/guides/roadmap' },
      { title: 'Audits', url: '/guides/audits' },
      { title: 'Analytics', url: '/guides/analytics' },
      { title: 'Running in the background', url: '/guides/background' },
    ],
  },
  {
    title: 'Ads',
    items: [
      { title: 'Overview', url: '/ads' },
      { title: 'Creatives', url: '/ads/creatives' },
      { title: 'Hand-off', url: '/ads/hand-off' },
      { title: 'Results and next steps', url: '/ads/results' },
      { title: 'Limits and checks', url: '/ads/limits' },
    ],
  },
  {
    title: 'Accessibility',
    items: [
      { title: 'Overview', url: '/accessibility' },
      { title: 'Scanning a site', url: '/accessibility/scanning' },
      { title: 'Reading the results', url: '/accessibility/results' },
      { title: 'AI help', url: '/accessibility/ai-help' },
      { title: 'Content and documents', url: '/accessibility/content-and-documents' },
      { title: 'Checklist and reports', url: '/accessibility/checklist-and-reports' },
      { title: 'Issues in GitHub or GitLab', url: '/accessibility/issue-trackers' },
    ],
  },
  {
    title: 'SEO & GEO',
    items: [
      { title: 'Overview', url: '/seo' },
      { title: 'Site health', url: '/seo/site-health' },
      { title: 'Search performance', url: '/seo/search' },
      { title: 'AI visibility', url: '/seo/ai-visibility' },
      { title: 'Opportunities', url: '/seo/opportunities' },
      { title: 'Agent readiness', url: '/seo/agents' },
      { title: 'Off-site presence', url: '/seo/off-site' },
      { title: 'AI crawlers and llms.txt', url: '/seo/ai-crawlers' },
    ],
  },
  {
    title: 'Security',
    items: [
      { title: 'Overview', url: '/security' },
      { title: 'Checks', url: '/security/checks' },
      { title: 'Findings and report', url: '/security/findings' },
      { title: 'Monitoring', url: '/security/monitoring' },
      { title: 'Disclosure', url: '/security/disclosure' },
    ],
  },
  {
    title: 'Bring your own credentials',
    items: [
      { title: 'Overview', url: '/credentials' },
      { title: 'Anthropic API key', url: '/credentials/anthropic' },
      { title: 'OpenAI API key', url: '/credentials/openai' },
      { title: 'Google Analytics', url: '/credentials/google' },
      { title: 'Umami', url: '/credentials/umami' },
      { title: 'Google Search Console', url: '/credentials/search-console' },
      { title: 'Bing Webmaster Tools', url: '/credentials/bing-webmaster' },
      { title: 'Product database', url: '/credentials/supabase' },
      { title: 'Stripe', url: '/credentials/stripe' },
      { title: 'GitHub and GitLab', url: '/credentials/github-gitlab' },
      { title: 'X API (optional, paid)', url: '/credentials/x-api' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { title: 'Glossary', url: '/concepts/glossary' },
      { title: 'How Startica uses AI', url: '/concepts/ai' },
      { title: 'Costs and budget', url: '/concepts/costs' },
      { title: 'Privacy and security', url: '/concepts/privacy-security' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Settings', url: '/reference/settings' },
      { title: 'Background jobs', url: '/reference/jobs' },
      { title: 'Environment variables', url: '/reference/environment' },
      { title: 'Data folder', url: '/reference/data-folder' },
      { title: 'Scripts', url: '/reference/scripts' },
    ],
  },
  {
    title: 'Help',
    items: [
      { title: 'Troubleshooting', url: '/troubleshooting' },
      { title: 'FAQ', url: '/troubleshooting/faq' },
    ],
  },
  {
    title: 'Contributing',
    items: [
      { title: 'How to contribute', url: '/contributing' },
      { title: 'Architecture', url: '/contributing/architecture' },
      { title: 'Development setup', url: '/contributing/dev-setup' },
      { title: 'Working rules', url: '/contributing/working-rules' },
      { title: 'Add a channel adapter', url: '/contributing/channel-adapter' },
      { title: 'Add a metrics connector', url: '/contributing/connector' },
      { title: 'Add a background job', url: '/contributing/background-job' },
      { title: 'Add a playbook', url: '/contributing/playbook' },
      { title: 'Add a site check', url: '/contributing/site-check' },
      { title: 'Prompts and evals', url: '/contributing/prompts-evals' },
      { title: 'Testing', url: '/contributing/testing' },
      { title: 'Releases', url: '/contributing/releases' },
      { title: 'Docs and website', url: '/contributing/docs-and-website' },
    ],
  },
];

export default {
  site: {
    // The wordmark and S mark as inline SVG (currentColor), from packages/brand. Decorative: the
    // surrounding links carry the accessible name.
    logo: logoSvg({ title: null }),
    mark: markSvg({ title: null }),
    title: 'Startica Docs',
    url: 'https://docs.mystartica.com',
    description:
      'Documentation for Startica, the open-source AI co-founder for everything after you ship: marketing, SEO & GEO, accessibility and security for your product, on your desktop. Install, guides, credentials, reference and contributing.',
    author: 'Christopher Casper',
    language: 'en',
    repo: 'https://github.com/chriscasper/startica',
    editBase: 'https://github.com/chriscasper/startica/edit/main/apps/docs/content/',
    homepage: 'https://mystartica.com',
    docsNav,
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
    llmsFull: true,
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
    port: 9001,
    open: false,
  },
};
