# YouTube API audit request (prepared answers)

Why this exists: the first upload test found uploads locked to private.
Test result: status stayed private after asking for unlisted

Form: https://support.google.com/youtube/contact/yt_api_form

## Answers to paste

**What does your API client do?**
It uploads up to three short videos a day (only those that pass every check) to our own channel, Congress Receipts.
Each video shows one stock trade a member of Congress reported in an official House filing, and how that stock did next to the S&P 500.
No other users. No other channels. We only upload to the channel we own.

**Which API features do you use?**
- youtube.videos.insert (upload our own video)
- youtube.videos.update (privacy status on our own videos)
- youtube.videos.list (read back our own video status)
- youtube.thumbnails.set (our own video's first frame as its thumbnail)
- youtube.channels.list (mine=true: confirm the connected channel is ours, and link to it)
- youtubeAnalytics.reports.query (views and retention of our own videos, used to improve future videos)

**Who uses the API client?**
Only us, the channel owner, who authorizes once through one link on our site. It runs as a scheduled job. There is no public app and no sign-in for anyone else.

**How do you store YouTube data?**
We keep video IDs, titles, and our own channel's view and retention numbers for 30 days at most.
We store no data about viewers.

**How do you show users that content is AI-assisted?**
Every upload sets the altered or synthetic content flag and says in the description that the narration is an AI voice.

**Quota needed**
The default 10,000 units a day is enough. We ask only for the upload lock to be lifted.

**Channel**
Congress Receipts. Site: https://congressreceipts.pages.dev
