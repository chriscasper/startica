---
title: Security checks
description: Every check the Security module runs, with its severity, what it looks at, and when it runs.
layout: doc
---

This page lists every security check, grouped by area, with its severity. Each finding in the app also says why it matters and how to fix it. For the screens and how to turn checks on, see [Security](/security).

## When the checks run

- **Page checks** run on every page a scan loads, from the main document's response headers and what the page loads. A finding that appears on several pages (a missing header, usually set once at the server or CDN) is one finding listing its pages.
- **Site checks** run once at the end of every full scan: a TLS handshake, the `http://` address, `/.well-known/security.txt`, three well-known file addresses and DNS lookups for your email domain.
- **Check a page** and a finding's **Recheck** run the page checks for those pages; **Recheck** on a site-wide finding runs the site checks again.

Sites on your own computer or network skip the HTTPS, certificate, redirect and email checks, which don't apply there. Nothing is requested for addresses ending in `.example`, `.test` or `.invalid`.

## Severity

| Severity | Meaning | Points off the score |
| --- | --- | --- |
| **Critical** | Something sensitive is exposed right now | 30 |
| **High** | Visitors' data can be read or changed on the way | 15 |
| **Medium** | A protection most sites should have is missing | 7 |
| **Low** | Hardening worth doing | 2 |
| **FYI** | Worth knowing; not counted | 0 |

## HTTPS and certificates

| Check | Severity |
| --- | --- |
| Site isn't served over HTTPS | High |
| The `http://` address doesn't redirect to HTTPS | Medium |
| Connection uses TLS 1.0 or 1.1 | High |
| The HTTPS certificate isn't trusted (expired, self-signed or for another name) | High |
| The certificate expires within 21 days | Medium |
| No `Strict-Transport-Security` header (HTTPS pages) | Medium |
| `Strict-Transport-Security` lasts less than 180 days | Low |

## Security headers

| Check | Severity |
| --- | --- |
| No `Content-Security-Policy` | Medium |
| `Content-Security-Policy` allows any script (`'unsafe-inline'` without nonces or hashes, `*`, or no script restriction) | Low |
| Pages can be framed by other sites (no `frame-ancestors` and no `X-Frame-Options`) | Medium |
| No `X-Content-Type-Options: nosniff` | Low |
| No `Referrer-Policy` | Low |
| `Server` or `X-Powered-By` shows a version number | Low |
| No `Permissions-Policy` | FYI |
| A generator meta tag shows the site builder's version | FYI |

## Cookies

Checked for each cookie a page sets, so you can accept one cookie's risk without hiding the others.

| Check | Severity |
| --- | --- |
| Cookie without `Secure` (HTTPS pages) | Medium |
| Cookie without `HttpOnly` | Low |
| Cookie without `SameSite` | Low |

## Page content

| Check | Severity |
| --- | --- |
| HTTPS page loads scripts, stylesheets or frames over `http://` | High |
| HTTPS page loads images or media over `http://` | Low |
| A form on an HTTPS page posts to `http://`, or a password field is on an `http://` page | High |
| A script from another site has no Subresource Integrity hash (one finding per host) | Low |
| A folder's file list is public ("Index of /") | Medium |

## Exposed files

One GET for each address. Redirects aren't followed, and a file only counts when its content matches: a site that answers every address with its home page doesn't trigger these.

| Check | Severity |
| --- | --- |
| `/.git/HEAD` is public (the site's Git folder) | Critical |
| `/.env` is public | Critical |
| `/.DS_Store` is public | Low |

## Email domain

For the site's domain (without `www.`). DMARC is looked up on the domain, then on its parent domain.

| Check | Severity |
| --- | --- |
| No SPF record | Medium |
| No DMARC record | Medium |
| DMARC only monitors (`p=none`) | Low |

## Reporting problems

| Check | Severity |
| --- | --- |
| No `/.well-known/security.txt` | Low |
| `security.txt` has no `Contact:`, no `Expires:`, or has expired ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)) | Low |
