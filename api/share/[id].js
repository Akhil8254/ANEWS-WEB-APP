// api/share/[id].js
//
// This runs on Vercel's server, NOT in the browser. When someone shares
// a link like https://yoursite.vercel.app/share/42, apps like WhatsApp,
// Facebook, and Twitter fetch this URL to build the preview card. They
// don't execute JavaScript, so React alone can never show them the right
// photo/title — this function returns plain HTML with the correct
// og:title / og:image tags for that one article, then redirects real
// visitors into the actual app.
//
// Requires SUPABASE_URL and SUPABASE_ANON_KEY (or your existing
// REACT_APP_-prefixed equivalents) to be set in Vercel's Environment
// Variables — see the setup notes below.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = async function handler(req, res) {
  const { id } = req.query;
  const siteUrl = `https://${req.headers.host}`;
  const appUrl = `${siteUrl}/?article=${id}`;

  const { data: article, error } = await supabase
    .from("articles")
    .select("id, title, text, images, img")
    .eq("id", id)
    .single();

  if (error || !article) {
    res.setHeader("Content-Type", "text/html");
    res.status(404).send(
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${siteUrl}" /></head><body>Redirecting…</body></html>`
    );
    return;
  }

  const image =
    (Array.isArray(article.images) && article.images.length > 0 && article.images[0]) ||
    article.img ||
    `${siteUrl}/logo512.png`;

  // Detect the real image type from its file extension instead of
  // assuming JPEG — WhatsApp is strict about a mismatched og:image:type
  // (e.g. declaring "image/jpeg" for a file that's actually a .png).
  const extMatch = image.match(/\.(\w+)(?:\?.*)?$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const imageMimeMap = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  const imageType = imageMimeMap[ext] || "image/jpeg";

  const description = (article.text || "").slice(0, 160);
  const title = article.title || "ANEWS E-Paper";

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} - ANEWS E-Paper</title>
    <meta name="description" content="${escapeHtml(description)}" />

    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="${imageType}" />
    <meta property="og:url" content="${appUrl}" />
    <meta property="og:site_name" content="ANEWS E-Paper" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />

    <meta http-equiv="refresh" content="0;url=${appUrl}" />
    <script>window.location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <p>Redirecting to the article…</p>
  </body>
</html>`;

  // Tell WhatsApp/Facebook's crawler not to cache a stale version of
  // this HTML response itself (their own preview-image cache is separate
  // and longer-lived, but this at least stops us adding to the problem).
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(html);
};