---
title: Monitoring
description: What exposure monitoring watches around a verified site (libraries with known vulnerabilities, subdomains, certificates, look-alike domains and third-party scripts) and which outside services it uses.
layout: doc
---

**Security → Monitoring** watches what's around your site, beyond its own pages: the libraries the pages load, the names on certificates issued for your domain, where your subdomains point, domains that look like yours, and scripts loaded from other sites. It runs every day at 06:47 and after each full scan, for verified sites only. **Check now** runs it right away.

What it finds becomes findings like any other (see [Findings and report](/security/findings)), and counts in the score.

## Libraries with known vulnerabilities

Each scan notes the common client-side libraries a page loads and their versions: jQuery, jQuery UI, Bootstrap, AngularJS and Angular, Vue, React, Lodash, Moment, Handlebars and DOMPurify. It reads them from the page's own globals (for example `jQuery.fn.jquery`) and from script addresses (for example `jquery-3.4.1.min.js` or `lodash@4.17.15`).

Monitoring asks [OSV.dev](https://osv.dev) for advisories about each version. Each advisory shows:

- its severity, from the advisory;
- **EPSS**: the estimated chance that it's exploited in the next 30 days, from [FIRST](https://www.first.org/epss/);
- **Known exploited**: it's on [CISA's KEV list](https://www.cisa.gov/known-exploited-vulnerabilities-catalog), so attackers are using it now;
- the versions it's fixed in.

The finding takes the worst advisory's severity, and at least **High** when one is known exploited. Within the same severity, findings with known exploited advisories and higher EPSS come first.

## Subdomains and certificates

Monitoring reads the public certificate transparency logs (through [crt.sh](https://crt.sh)) for your domain. The certificates logged for it show which names exist, like `app.` or `docs.`, and who issued them. A certificate you didn't ask for can mean someone else controls a name of yours. New ones are marked **New** for a week.

For each subdomain it looks up where it points. When a subdomain's CNAME points at a name that doesn't exist any more (a deleted app, bucket or site), that's a **Subdomain points to a service that no longer exists** finding: someone could claim that name at the provider and serve their own content on your subdomain.

## Look-alike domains

Monitoring makes up to 60 common variations of your domain: the same name on other endings (`.com`, `.net`, `.org`, `.co`, `.io`, `.app`), missing, doubled and swapped letters, a hyphen, and look-alike characters (`0` for `o`, `1` for `l`, `rn` for `m`). It checks each one through DNS only; Startica never visits them. Each one that's registered is a low-severity finding. Accept the risk for ones that are unrelated.

## Third-party scripts

For each script your pages load from another site without an integrity check (see [Page content](/security/checks#page-content)), monitoring downloads it and keeps a fingerprint of its content. When the content changes, that's a **A third-party script changed** finding. It's usually a normal update; check it, then accept it to mark it reviewed. It stays open until you do.

## Outside services

These are free public services. Monitoring sends them only what it needs:

| Service | What it gets |
| --- | --- |
| crt.sh (certificate transparency logs) | Your domain |
| OSV.dev | Library names and versions |
| FIRST EPSS | CVE identifiers |
| CISA KEV | Nothing: the list is downloaded once a day and kept in your data folder |
| Public DNS | Your subdomains and the look-alike names |
| The script's own host | A GET for the script, like your pages already make |

When a service can't be reached, its findings stay as they were and the page says what couldn't run; it's tried again next time.
