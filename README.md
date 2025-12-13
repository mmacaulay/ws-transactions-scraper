# Wealthsimple Transactions Scraper
Tired of waiting for monthly credit card statements from Wealthsimple in a CSV format that can't be imported into standard accounting software? Me too! Now you can download them any time, in Quicken (QFX) format for easy import into accounting tools like Quicken or YNAB.

## Installation

- `npm install && npm run build`
- In your browser: add bookmark to your bookmarks toolbar with name `WS CC transactions` (or whatever you want) and set the URL to the contents of `build/ws-visa-bookmarklet.js`

Disclaimer: it should go without saying, but you should understand what this code is doing before running it while logged in to your financial institution's website.

## Usage

- Navigate to your Wealthsimple Visa page -> All Activities
- Click bookmarklet which should initiate download of .QFX file!

Any transactions visible on the screen will be downloaded (that is, if you want to load more you'll have to load them on the screen manually first).
