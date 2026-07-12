import axios from "axios";
import * as cheerio from "cheerio";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const BASE = "https://musicaldown.com";
const HOME = `${BASE}/id`;

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

const jar = new CookieJar();

const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
    timeout: 60000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      "user-agent": UA,
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  })
);

function absoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return new URL(url, BASE).href;
}

function cleanText(text = "") {
  return text
    .replace(/arrow_downward/gi, "")
    .replace(/content_paste/gi, "")
    .replace(/close/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseBackgroundImage(style = "") {
  const match = style.match(/url\((.*?)\)/i);
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, "");
}

function stripDownloadTitle(title = "") {
  return cleanText(title)
    .replace(/\s*\|\s*Download Sekarang!?$/i, "")
    .replace(/\s*\|\s*Download Now!?$/i, "")
    .trim();
}

async function getFormData(url) {
  const res = await client.get(HOME, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      referer: HOME,
      "cache-control": "max-age=0",
      "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document",
      "upgrade-insecure-requests": "1"
    }
  });

  if (res.status !== 200) {
    throw new Error(`Gagal buka home HTTP ${res.status}`);
  }

  const html = String(res.data || "");
  const $ = cheerio.load(html);

  const form = $("#submit-form").first();
  const action = absoluteUrl(form.attr("action") || "/id/download");
  const urlField = form.find('input[type="text"][name]').first().attr("name");

  if (!urlField) {
    throw new Error("Field URL tidak ditemukan");
  }

  const body = new URLSearchParams();

  body.set(urlField, url);

  form.find('input[type="hidden"][name]').each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value") || "";

    if (name) {
      body.set(name, value);
    }
  });

  return {
    action,
    body
  };
}

function parseMetadata($) {
  const rawTitle = cleanText($("title").first().text());
  const bgStyle = $(".video-header").attr("style") || "";

  const author =
    cleanText($(".video-author").first().text()) ||
    cleanText($(".author").first().text()) ||
    cleanText($("[class*=author]").first().text()) ||
    null;

  const description =
    cleanText($(".video-desc").first().text()) ||
    cleanText($(".desc").first().text()) ||
    cleanText($("[class*=desc]").first().text()) ||
    cleanText($("meta[property='og:description']").attr("content")) ||
    cleanText($("meta[name='description']").attr("content")) ||
    null;

  const thumbnail =
    parseBackgroundImage(bgStyle) ||
    $(".img-area img").first().attr("src") ||
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    null;

  const metadata = {
    title: stripDownloadTitle(rawTitle) || rawTitle || null,
    full_title: rawTitle || null,
    author,
    description,
    thumbnail
  };

  Object.keys(metadata).forEach(key => {
    if (!metadata[key]) delete metadata[key];
  });

  return metadata;
}

function getLinkType(text, event, url) {
  const source = `${text} ${event} ${url}`;

  if (event === "mp4_download_click" || /^Download MP4$/i.test(text)) {
    return "video";
  }

  if (event === "hd_download_click" || /\[HD\]/i.test(text)) {
    return "video_hd";
  }

  if (event === "watermark_download_click" || /watermark/i.test(text)) {
    return "video_watermark";
  }

  if (event === "mp3_download_click" || /mp3|audio|sound/i.test(source)) {
    return "audio";
  }

  if (/jpg|jpeg|png|webp|image|photo|slide/i.test(source)) {
    return "photo";
  }

  return null;
}

function getOrder(type) {
  const order = {
    video_hd: 1,
    video: 2,
    video_watermark: 3,
    photo: 4,
    audio: 99
  };

  return order[type] || 50;
}

function addUnique(result, item) {
  if (!item.url) return;

  const exists = result.some(v => v.url === item.url);

  if (!exists) {
    result.push(item);
  }
}

function parseResult(html) {
  const $ = cheerio.load(html);

  const metadata = parseMetadata($);
  const result = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const label = cleanText($(el).text());
    const event = $(el).attr("data-event") || "";

    if (!href) return;

    const url = absoluteUrl(href);

    if (!url.includes("fastdl.muscdn.app")) return;

    const type = getLinkType(label, event, url);

    if (!type) return;

    addUnique(result, {
      type,
      label: label || type,
      url
    });
  });

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;

    const url = absoluteUrl(src);

    if (
      url.includes("fastdl.muscdn.app/a/images") ||
      url.includes("tiktokcdn")
    ) {
      addUnique(result, {
        type: "photo",
        label: "Photo",
        url
      });
    }
  });

  $("[style]").each((_, el) => {
    const bg = parseBackgroundImage($(el).attr("style") || "");
    if (!bg) return;

    const url = absoluteUrl(bg);

    if (
      url.includes("fastdl.muscdn.app/a/images") ||
      url.includes("tiktokcdn")
    ) {
      addUnique(result, {
        type: "photo",
        label: "Photo",
        url
      });
    }
  });

  result.sort((a, b) => getOrder(a.type) - getOrder(b.type));

  return {
    metadata,
    result,
    hasResult: result.length > 0
  };
}

async function musicaldown(url) {
  const form = await getFormData(url);

  const res = await client.post(form.action, form.body.toString(), {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "content-type": "application/x-www-form-urlencoded",
      origin: BASE,
      referer: HOME,
      "cache-control": "max-age=0",
      "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document",
      "upgrade-insecure-requests": "1"
    }
  });

  const html = String(res.data || "");

  if (html.includes('id="submit-form"') && !html.includes("fastdl.muscdn.app")) {
    return {
      Status: false,
      Code: res.status,
      Input: url,
      Error: "MusicalDown balik ke halaman home, tidak ada link download di response."
    };
  }

  const parsed = parseResult(html);

  return {
    Status: res.status === 200 && parsed.hasResult,
    Code: res.status,
    Input: url,
    Metadata: parsed.metadata,
    Result: parsed.result
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const result = await musicaldown(url);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      Status: false,
      Code: 500,
      Input: url,
      Error: error.message
    });
  }
    }
