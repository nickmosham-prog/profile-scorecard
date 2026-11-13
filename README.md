# Profile Scorecard

Scores a professional-network profile from 0 to 100 against a best-practice rubric and lists the top 3 fixes.

This tool is not affiliated with LinkedIn. The rubric is best practice, not LinkedIn's ranking algorithm, and a higher score does not guarantee more visibility. The tool never scrapes or fetches anything: you paste your own profile text into a file.

## Status

Phase 4 (command line scorer with AI sub-scores, PDF import, and the full paid report). See `CLAUDE.md` for the full build plan.

Rule-based checks always run on your computer. If an API key is present, the headline, About and experience text is also sent to the Claude API for three quality sub-scores and rewrite suggestions. Add `--no-ai` to keep everything local.

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

### Score an exported PDF

Pass a `.pdf` instead of a `.txt`:

```bash
npx tsx src/cli.ts score Profile.pdf --target-role "Financial Analyst"
```

The export lists only your top 3 skills, so you are asked one extra question: how many skills your profile has in total. If a PDF has no selectable text or no recognisable sections, the tool says so and asks you to paste the text into a `.txt` file instead.

## Write the full report

```bash
npx tsx src/cli.ts report profile.txt --target-role "Financial Analyst"
```

This scores the profile, then asks the stronger model for three headline options, a full About rewrite, improved experience bullets, and concrete steps for each fix. It writes `report.md` and `report.pdf` (use `--out name` to change the name, and `--client "Name"` to print the client's name on the cover and page headers) and prints what the profile cost. No request is started that could take one profile over $0.10. Each run adds a line (time and cost only) to `logs/report-costs.csv`.

The rewrites are AI suggestions. The report tells the reader to check every fact and fill in the bracketed placeholders.

## Turn on AI scoring

1. Create an API key at console.anthropic.com and set a monthly spend limit there.
2. Copy `.env.example` to `.env` and paste the key after `ANTHROPIC_API_KEY=`. Never share or commit `.env`.
3. Run the `score` command as usual.

If the key is missing or the API fails, the report says "AI score unavailable" and falls back to the rule-based checks.

AI answers are saved in `.cache/ai/` so the same profile always gets the same score. Those files contain the AI's reasons, short quotes and rewrites. Delete the folder to clear them.

To compare the two models on a folder of real profiles (writes `docs/model-ab.md`):

```bash
npx tsx src/cli.ts compare my-profiles --target-role "Financial Analyst"
```

## Tune the scoring

Edit `src/rubric.json`: weights, thresholds, keyword lists, and the fix wording all live there. Bump `"version"` when you change it. The file is checked on startup; if the points stop adding up to 100 you get an error instead of a wrong score.

## Test

```bash
npm test
```

`npm test` never calls the API. `LIVE=1 npm test` also runs two tests against the real API (a fraction of a cent).

The profiles in `test/fixtures/` are synthetic, written for testing. They are not real people.
