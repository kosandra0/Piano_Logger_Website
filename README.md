# Piano Logger — Official Website

**Live site:** https://kosandra0.github.io/Piano_Logger_Website/

This is the official promotional website for **Piano Logger**, a piano MIDI visualizer and lifetime key logger. From the site you can:

- explore the features and the web app preview,
- open the **Piano Logger web app**: https://kosandra0.github.io/Piano_Logger/
- download the **Windows app** (Windows 10 and 11, 64-bit) and browse previous releases,
- read the help and contact the project on GitHub.

Piano Logger source and releases: https://github.com/kosandra0/Piano_Logger

## Piano Logger Cloud (phone dashboard)

`dashboard/` is a separate page for people who use the optional Cloud sync in Piano Logger 9.2.1: https://kosandra0.github.io/Piano_Logger_Website/dashboard/ . Sign in with the same account to see totals, streaks, a practice calendar, sessions and devices, made for phones first. It is read-only, shows totals only (never single key presses), has no library, no inline scripts and a strict Content-Security-Policy, and talks only to the cloud sync service. `dashboard/cs-core.js` and `dashboard/cs-net.js` are copies of the app's own files (a test fails if they drift) and `dashboard/stats-core.js` holds the statistics (tested to agree exactly with the app).

## About this repository

A static site: plain HTML, CSS and JavaScript with no build step and no dependencies. The release list and the latest download are loaded live from the GitHub Releases API.

Mockups on the site use demonstration data and are labelled as such.
