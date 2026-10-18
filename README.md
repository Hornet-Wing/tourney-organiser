# Town Centre

An organiser desk for small **Age of Empires II: Definitive Edition 1v1 tournaments**. Turn player availability messages into reviewed scheduling windows, arrange matches, record confirmations, and advance an eight-player bracket.

Built for [Hacktoberfest Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12). The proposed customer is a recurring community tournament organiser or streamer. A £5–£10 per-event price is a hypothesis to validate; no customer interviews, payments, or commercial results are claimed.

## Run locally

Requires Node.js 20 or later. There are no packages to install and no build step.

From the project directory (the one containing `package.json`):

```sh
npm start
```

Open **http://127.0.0.1:4173**. Set `PORT` to change the port. The server binds to loopback by default.

The app is also a static site: deploy the contents of `dist/` to an HTTPS static host. Open it through HTTP/HTTPS rather than double-clicking `index.html`, because it uses JavaScript modules. Serve `.js` files as JavaScript.

## Try the sample

The fictional October Open contains eight players and four quarterfinals:

- **Aster vs Scout:** both players have confirmed; ready to play.
- **Loom vs Nomad:** a proposed time needs Nomad's confirmation.
- **Castle vs Monk:** Monk has not shared availability.
- **Mangonel vs Boar:** their windows do not overlap.

To exercise the full workflow:

1. Open Castle vs Monk and edit Monk's availability. Add 24 October 2026, 18:00–22:00, Europe/London.
2. Propose a suggested match time, then record confirmations you received from both players.
3. Copy the Discord announcement. This copies text only; it does not post anywhere.
4. Record a valid best-of-three result such as 2–1 and view the winner in the semifinal.
5. Use **Create your tournament** to clear sample availability and enter your own eight players.
6. Use **Backup & restore** to export your work. Data is saved in localStorage on this browser and does not sync between devices or users.

## Local AI

Choose **Read a player message**, then **Download & load local AI**. The app loads [WebLLM 0.2.85](https://github.com/mlc-ai/web-llm/releases/tag/v0.2.85) and the open-weight [Qwen2.5 0.5B Instruct model](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct), using the [MLC WebGPU build](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f32_1-MLC).

- A current desktop Chrome or Edge with WebGPU and hardware acceleration is recommended.
- Allow a several-hundred-MB first download, several minutes to load, and approximately 1.1 GB of available GPU memory. Actual performance depends on the device.
- Model inference happens in a worker on your device. Player messages are not sent to a hosted inference API. Runtime and model files are fetched from esm.run, Hugging Face, and the model library CDN. Fonts are requested from Google Fonts; system-font fallbacks are provided.
- The model download is explicit, not automatic. Model files are cached by the browser; they can be evicted by the browser or cleared with site data.
- The app supplies an explicit JSON Schema string to WebLLM, validates dates, times and IANA zones, and requires a review before accepting windows. It never lets the model seed players, award wins, or confirm matches.
- Confirm the player's declared time zone and use the message's date as the reference date. “After seven” alone is incomplete; ask for an end time. AI may still misinterpret a message, particularly with this small model.
- Manual availability supports the entire workflow when AI cannot load.

Read the [WebLLM documentation](https://webllm.mlc.ai/docs/user/basic_usage.html) for browser/model requirements and upstream licensing. No model weights or third-party runtime code are vendored in this repository.

## Scope and rules

- Exactly eight players; single elimination; best-of-1, 3, 5, or 7, with one shared series format.
- Initial seed order is organiser-approved. Ratings are manually entered 1v1 Elo, with 0 meaning unrated. Reseeding by entered Elo is an explicit, destructive bracket reset.
- An organiser sets the reserved series duration, including drafts and breaks. It is an estimate, not a prediction of AoE2 match length.
- A proposed series must fit fully within both players' availability and cannot overlap another reserved series for either player. Later rounds must follow the reserved slots of their prerequisite matches.
- Schedule changes clear confirmations. Confirmations are recorded by the organiser; there is no player authentication or confirmation portal.
- AI cannot create availability with an unknown declared time zone. Ambiguous and nonexistent local times at daylight-saving transitions are rejected; entering the time in UTC resolves ambiguity.
- Each manual availability window is on one local date. Split overnight windows across dates.
- Results require exactly one series winner and lock after recording. To correct a completed result in this prototype, export a backup and reset the bracket. Resetting clears all results, match times, confirmations, and draft links.
- Draft links, map pools, and lobby/handbook notes are organiser-provided. This app does not implement civilization drafting or assume one ruleset applies to every event.
- No AoE2 API, Discord bot permissions, automatic messaging, database, accounts, payments, or live game monitoring are required.

The [official AoE2 tournament handbook](https://www.ageofempires.com/news/tournament_handbook_ageiide/) informed the scheduling workflow. Event-specific rules and organiser decisions govern the actual tournament. This is an independent community project, not an official Age of Empires product.

## Architecture

```text
Player message → local WebLLM worker → validated draft windows
                                          ↓ organiser review
Editable availability → slot validation → proposed time → recorded confirmations
                                                           ↓
                                                     manual score
                                                           ↓
                                                    winner advances
```

- `dist/app.js`: interface, forms, event handlers, local persistence and backups.
- `dist/core.js`: pure scheduling, daylight-saving handling, validation and bracket rules.
- `dist/ai.js` and `dist/ai-worker.js`: lazy model loading and availability extraction.
- `dist/style.css`: responsive layout, keyboard focus and reduced-motion support.
- `server.mjs`: dependency-free local static server.

The visual direction uses slate blue (`#243b55`), pale slate (`#f4f6f8`), brass (`#ba934c`), green (`#277359`) and white. Barlow Condensed carries tournament names and score-like numbers; Barlow carries operational text. The bracket is a navigable competition structure, with the organiser's outstanding decisions beside the match cards.

## Verification

```sh
npm run check
npm test
```

The suite contains 26 tests: 14 core-rule tests, eight DOM-adapter interaction tests, and four AI request/response contract tests. Coverage includes scheduling, confirmations, result progression, backup validation, UI navigation, new-event creation, HTML escaping, and the serialized JSON Schema required by the WebLLM grammar compiler. The DOM adapter and AI boundary tests do not verify browser layout or actual GPU inference.

If an older checkout reports `GrammarMatcherInitError: Cannot pass non-string to std::string`, update to the fixed `dist/ai.js` and reload the page. The fix supplies `response_format.schema` as a JSON string; it does not require deleting downloaded model weights.

In the build workspace, local server binding and Chromium launch were blocked by sandbox restrictions. Real-browser layout and real-model inference were therefore **not verified here**. Before recording your submission demo, open the site in a WebGPU-capable browser, load the model, run the example message, inspect the output, and check the mobile layout. Do not describe AI accuracy or end-user feedback as measured until you have tested them.

## Record your submission demo

Aim for a focused two-to-three-minute walkthrough. Use the fictional sample tournament throughout; do not present its confirmations as real player feedback.

1. Run `npm start` in this project directory and open `http://127.0.0.1:4173` in a current desktop Chrome or Edge.
2. Click **Read a player message** and select Monk, reference date **2026-10-24**, and time zone **Europe/London**. Choose **Download & load local AI** and wait for the ready message before recording.
3. Rehearse with: `I can play on 24 October 2026 from 18:00 to 22:00, Europe/London.` Click **Extract availability**. Check what the model actually returns. Only accept it if the date, start, end, and time zone match the message. If loading or inference fails, troubleshoot before claiming the AI workflow works.
4. If you saved rehearsal changes, export any data you need, then choose **Backup & restore → Reload sample tournament**. This resets the fictional event while leaving the already-loaded model available in the current tab.
5. Start your computer's screen recorder. On GNOME, press **Print Screen**, switch to video mode, choose the browser area, and click the red record button. Stop with the red indicator in the top bar. GNOME saves the file under `Videos/Screencasts`. See the [official recording instructions](https://help.gnome.org/gnome-help/screen-shot-record.html).
6. Introduce the problem: “Town Centre helps an AoE2 1v1 tournament organiser see which matches need attention and arrange their next series.” Show the dashboard's four sample match states.
7. Open the message reader, extract Monk's sample availability, review it, and save it. Open **Castle vs Monk**, choose **24 October 2026 at 18:00 Europe/London**, and propose the time.
8. Explain that these are fictional confirmations for the demo, tick both players, and save. Show the match becoming ready. Copy the Discord announcement; no real Discord post is needed.
9. Record **Castle 2–1 Monk**, then open the bracket to show Castle in the semifinal. Explain that the model reads messages while ordinary code checks slots and advances winners.
10. Stop recording. Upload the video to YouTube as **Unlisted** or **Public** and test that its link plays without signing in. A private video will not work for judges. See [YouTube visibility settings](https://support.google.com/youtube/answer/157177?hl=en).

You can show the required workflow in a video without a hosted live site. Keep the model download outside the recording. Captions or a short voice-over can explain the flow; show actual model output and any observed limitations honestly.

## Week 2 submission preparation

The implementation is a prototype, not a published contest entry. Before submission:

1. Test actual model extraction and keep the demo honest about its limitations.
2. Record a short video covering missing availability → reviewed AI output → valid proposal → confirmations → result → bracket advancement. A video demo is supported by the challenge template.
3. Make the source repository available to judges and include a demo link or recording.
4. Write the DEV post using the Side Hustle template with `devchallenge` and `hf26challenge` tags. Cover the customer problem, implementation, why open innovation matters, and real feedback if you have it. Writing quality is the most heavily weighted criterion.
5. Disclose AI assistance honestly. Enter partner categories only for technologies actually used; no partner category or prize eligibility is claimed by this project.
6. Check the deadline on the [official DEV challenge page](https://dev.to/challenges/hacktoberfest-week2-2026-10-12). Its published deadline is October 18, 2026 at 11:59 PM PDT (October 19, 06:59 UTC); the connected MLH event listing showed a conflicting earlier end time during research. Use the challenge's official contest rules for the entry deadline.

To share the code without command-line Git authentication, create a public GitHub repository named `town-centre`. Use **Add file → Upload files** (or the upload link on the empty-repository page), then drag in `dist/`, `test/`, `package.json`, `server.mjs`, `README.md`, `LICENSE`, and `.gitignore`, and commit the upload. These should be at the repository root, with the `dist` and `test` folders intact. See [GitHub's upload instructions](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

A DEV draft has been saved under the title **Town Centre: An AoE2 Tournament Desk with Local AI**. Before publishing it, add the actual repository and video links, change the future-tense demo section to match your recording, and update the verification paragraph with what you really tested. Keep AI disclosure and the `devchallenge` / `hf26challenge` tags. A saved draft does not submit the entry: publishing the completed challenge post is the entry step described by the DEV challenge page. Check the published post and both links in a signed-out browser afterwards.

No external post, transcript, project submission, or tournament announcement is published by this app.

## Community references

- [I Watched a Streamer Suffer Through Tournament Admin and Spent A Month Fixing It](https://dev.to/scythe2/-i-watched-a-cod-streamer-suffer-through-tournament-admin-and-then-spent-a-month-fixing-it-k8d), by scythe2: the cost of manually coordinating tools during a community tournament.
- [Building an AI lineup optimizer for a Discord esports bot (the algorithm, not the hype)](https://dev.to/ravendev/building-an-ai-lineup-optimizer-for-a-discord-esports-bot-the-algorithm-not-the-hype-2hjh), by ravendev: use language models for language and explicit logic for constraints.
- [I built React components that run Qwen2.5 in the browser via WebGPU – no server, no API key, works offline](https://dev.to/dhruvil_chauhan_eccb4a1eb/i-built-react-components-that-run-qwen25-in-the-browser-via-webgpu-no-server-no-api-key-works-7e0), by dhruvil_chauhan_eccb4a1eb: a related approach to local model-powered extraction. Town Centre is plain JavaScript and does not use that library or reproduce its code.

## License

Original application code is MIT licensed. Age of Empires names belong to their respective owners. Upstream models, runtime packages and fonts retain their own licenses.
