# Wealthsimple Transactions Scraper 🙈
Tired of waiting for monthly credit card or chequing account statements from Wealthsimple in a CSV format that can't be imported into standard accounting software? Me too! Now you can download them any time, in Quicken (QFX) format for easy import into accounting tools like Quicken or YNAB.

## Account support

The first version of this script ([ws-visa.js](ws-visa.js)) was built for the Wealthsimple Visa credit card, there is now a second script ([ws-chequing.js](ws-chequing.js)) that works on chequing accounts.

## Installation

Build:
```
npm install && npm run build
```

In your browser:
  - add bookmark to your bookmarks toolbar with helpful name such as `WS CC transactions`
  - copy the contents of `build/ws-<account-type>-bookmarklet.json`
  - paste into URL field of bookmark

 **Disclaimer**: it should go without saying, but it is your responsibility to understand what this code is doing before running it on your financial institution's website.

## Usage

- Navigate to your Wealthsimple Visa page -> All Activities
- Click bookmarklet which should initiate download of .QFX file!

Any transactions visible on the screen will be downloaded (that is, if you want to load more you'll have to load them on the screen manually first).
