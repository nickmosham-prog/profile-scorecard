# Profile Scorecard

Scores a professional-network profile from 0 to 100 against a best-practice rubric and lists the top 3 fixes.

This tool is not affiliated with LinkedIn. The rubric is best practice, not LinkedIn's ranking algorithm, and a higher score does not guarantee more visibility. The tool never scrapes or fetches anything: you paste your own profile text into a file.

## Status

Phase 1 (command line scorer, rule-based checks only). The AI step is stubbed, so no API key is needed and nothing leaves your computer. See `CLAUDE.md` for the full build plan.

## Use it

Install once:

```bash
npm install
```

Paste a profile into a text file (name on line 1, headline on line 2, then the About, Experience, Education and Skills sections with their headings), then:

```bash
npx tsx src/cli.ts score profile.txt --target-role "Financial Analyst"
```

It asks six yes/no and count questions about things the text cannot show (photo, banner, custom URL, Featured, recommendations, recent activity). To skip the questions, put the answers in a file:

```bash
npx tsx src/cli.ts score profile.txt --target-role "Financial Analyst" --answers answers.json
```

```json
{ "hasPhoto": true, "hasBanner": false, "hasCustomUrl": true, "featuredCount": 1, "recommendationsCount": 2, "activeLast30Days": true }
```

Add `--json` for machine-readable output or `--markdown` for markdown.

## Tune the scoring

Edit `src/rubric.json`: weights, thresholds, keyword lists, and the fix wording all live there. Bump `"version"` when you change it. The file is checked on startup; if the points stop adding up to 100 you get an error instead of a wrong score.

## Test

```bash
npm test
```

The 10 profiles in `test/fixtures/` are synthetic, written for testing. They are not real people.
