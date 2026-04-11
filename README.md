# HSK Study Hub

This is a static web app, so it works well on GitHub Pages.

## Project structure

- `index.html`: app layout
- `styles.css`: responsive styling and color themes
- `js/app.js`: app logic
- `js/data/hsk1.js`: HSK 1 vocabulary data
- `js/data/hsk2.js`: HSK 2 vocabulary data
- `js/data/radicals.js`: optional character etymology and radical notes

## How the data files connect

The main app imports the vocabulary files at the top of `js/app.js`:

```js
import { hsk1 } from "./data/hsk1.js";
import { hsk2 } from "./data/hsk2.js";
```

Each data file exports one object, for example:

```js
export const hsk1 = {
  id: "hsk1",
  title: "HSK 1",
  level: "Beginner",
  description: "Core beginner vocabulary",
  words: [
    ["爱", "ài", "to love", "我爱你。~wǒ ài nǐ\nI love you."]
  ]
};
```

Because these are local files in the same repository, GitHub Pages serves them automatically and the app can import them directly.

## Uploading to GitHub

1. Create a GitHub repository.
2. Upload all files in this folder.
3. In GitHub, open `Settings` -> `Pages`.
4. Set the source to your main branch and root folder.
5. GitHub Pages will publish the site.

## Adding more data later

- Add more HSK 1 words to `js/data/hsk1.js`
- Replace the sample HSK 2 list in `js/data/hsk2.js` with your full deck
- Add more character notes to `js/data/radicals.js`

## Premium plan path later

Right now HSK 2 is locked until HSK 1 is fully mastered.
Later, you can replace that unlock check in `js/app.js` with:

- completion-only unlock
- login-based unlock
- paid subscription unlock
- code redemption unlock
