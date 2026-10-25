import type { ChannelConfig } from "../lib/config.js";
import { esc, page } from "./templates.js";

/**
 * Privacy policy and terms, written to the YouTube API Services rules from day one (same standard
 * as Scam or Not's live privacy page). Written from what the code does today; the tests check the
 * key claims against config.
 */

export function privacyPage(c: ChannelConfig, root: string) {
  const email = esc(c.channel.contactEmail);
  const name = esc(c.channel.name);
  const body = `
<h1>Privacy</h1>
<p class="small">Last updated ${esc(c.channel.policyDate)}</p>
<p class="lede">Short version: we collect almost nothing. We never sell your information.</p>

<h2>What this site collects</h2>
<p><b>Nothing from visitors.</b> The site has no ads, no tracking tools, no visitor counters and no sign-in. Our site's code sets no cookies.</p>
<p><b>Email, only if a signup box is turned on.</b> We plan a free weekly email called "${esc(c.newsletter.name)}".${
    c.newsletter.enabled ? "" : " Right now it is turned off, so the site collects no email addresses at all."
  } If we turn it on, you can type in your email. We would then save your email address and the date you signed up, and use it only to send that weekly email. We would update this page first.</p>

<h2>Our web host</h2>
<p>The site is hosted by Cloudflare. Cloudflare handles the traffic to the site, like any web host. It may keep basic records, such as visit times and browser types. We don't use those records to track you.</p>

<h2>YouTube API Services</h2>
<p>${name} uses YouTube API Services. That is how our system posts our videos to YouTube and reads our own channel's numbers.</p>
<p>When you watch our videos on YouTube, you agree to the <a href="https://www.youtube.com/t/terms" rel="noopener">YouTube Terms of Service</a>. The <a href="http://www.google.com/policies/privacy" rel="noopener">Google Privacy Policy</a> explains how Google uses data.</p>
<p><b>What YouTube data we use.</b> Only data about our own ${name} channel. Our system does four things with it:</p>
<ul>
<li>It posts our own videos to our channel.</li>
<li>It checks the privacy setting of the videos it posted.</li>
<li>It reads our own channel's name and link, to show a "Watch on YouTube" link here.</li>
<li>It reads stats for our own videos. That means views, how much people watch, and how many stay past the start.</li>
</ul>
<p><b>What we never see.</b> Your YouTube account, your name, your watch history or your comments. We can't tell who watched.</p>
<p><b>What we keep.</b> The ID, title and privacy setting of each video we posted. We keep the stats for each video for 30 days at most, then delete them. From those stats we keep one score per opening-line style. That score holds no personal data.</p>
<p><b>The sign-in we store.</b> When the channel owner connects YouTube, our site keeps one sign-in token, locked with encryption, so the daily job can post. It belongs to our own channel only. Nobody else signs in.</p>
<p><b>Who can turn it off.</b> Only the owner of the ${name} channel signs in to YouTube for our system. The owner can remove its access at any time on <a href="https://security.google.com/settings/security/permissions" rel="noopener">Google's security settings page</a>. Then our system can no longer post or read stats.</p>
<p><b>Getting data deleted.</b> Email us and we will delete stored YouTube data within 30 days.</p>

<h2>We never sell or share it</h2>
<p>We don't sell your information. We don't rent it or trade it. We don't give it to advertisers.</p>

<h2>How to get removed</h2>
<p>Email <a href="mailto:${email}">${email}</a> and ask us to delete anything we hold about you. We will delete it within 30 days and tell you when it's done.</p>

<h2>Kids</h2>
<p>This site and our videos are not made for children under 13. We don't collect anything from them.</p>

<h2>Changes</h2>
<p>If we change how we use information, we will first update this page. We will also change the date at the top.</p>

<h2>Contact</h2>
<p>Questions? Email <a href="mailto:${email}">${email}</a>.</p>`;
  return page({ title: `Privacy | ${c.channel.name}`, description: `What ${c.channel.name} collects (almost nothing) and how to get removed.`, body, root, canonical: `${c.site.baseUrl}/privacy/` });
}

export function termsPage(c: ChannelConfig, root: string) {
  const email = esc(c.channel.contactEmail);
  const name = esc(c.channel.name);
  const body = `
<h1>Terms</h1>
<p class="small">Last updated ${esc(c.channel.policyDate)}</p>
<p class="lede">${name} is free. These are the simple rules for using it.</p>

<h2>What this is</h2>
<p>${name} is news. Each day we show one stock trade a member of Congress reported in a public filing. We show what was filed, when, and what the stock did next to the S&amp;P 500. That's all.</p>

<h2>Not financial advice</h2>
<p>${esc(c.channel.notAdvice)} Nothing here tells you to trade anything. We don't give investment advice, and we don't send trade alerts. Past prices don't predict future prices.</p>

<h2>Where the facts come from</h2>
<p>Trades come from the reports members file with the Clerk of the U.S. House of Representatives. Each receipt links to the filing itself. Party and state come from a public-domain list of members. Prices come from the price source named on each receipt.</p>
<p>The amount on a filing is a range, not an exact figure. We always show the range.</p>
<p>We never say why a member traded. The filings don't say, and neither do we.</p>

<h2>How we may use the reports</h2>
<p>Federal law limits how these reports may be used (5 U.S.C. 13107(c)). It bans commercial use, except by news and communications media sharing them with the general public. That's what we do. We publish for the public. We never sell the data, and we never sell alerts.</p>

<h2>We check, but we can be wrong</h2>
<p>Code and two separate reviews check every number against the filing before we post. If anything is unclear, we skip that trade. Still, filings can be amended and we can make mistakes. The filing is always the source of truth. Spot an error? Email us and we will fix it.</p>

<h2>AI</h2>
<p>The voice in our videos is made by AI. The filing card in each video is a clean recreation of the official report, made by code.</p>

<h2>YouTube</h2>
<p>Our videos are on YouTube, and we post them using YouTube API Services. When you watch them there, you agree to the <a href="https://www.youtube.com/t/terms" rel="noopener">YouTube Terms of Service</a>. Our <a href="../privacy/">privacy page</a> explains what YouTube data we use.</p>

<h2>Paid links</h2>
<p>If we ever add a paid link, we will label it "Paid link" right next to it.</p>

<h2>Using our content</h2>
<p>You are welcome to share links to our pages and videos. Please don't copy whole pages or videos and post them as your own.</p>

<h2>No promises</h2>
<p>We offer the site as it is. We don't promise it will always be online or free of errors. We are not responsible for losses from using it, as far as the law allows.</p>

<h2>Changes</h2>
<p>We may update these terms. We will change the date at the top when we do.</p>

<h2>Contact</h2>
<p>Questions? Email <a href="mailto:${email}">${email}</a>.</p>`;
  return page({ title: `Terms | ${c.channel.name}`, description: `The simple rules for using ${c.channel.name}.`, body, root, canonical: `${c.site.baseUrl}/terms/` });
}
