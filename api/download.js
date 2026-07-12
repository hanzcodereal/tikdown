const axios = require('axios');
const cheerio = require('cheerio');

const headers = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Origin: 'https://savett.cc',
  Referer: 'https://savett.cc/en1/download',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
};

async function getCsrf() {
  const res = await axios.get('https://savett.cc/en1/download', {
    headers: {
      'User-Agent': headers['User-Agent']
    }
  });
  
  return {
    csrf: res.data.match(/name="csrf_token" value="([^"]+)"/)?.[1],
    cookie: res.headers['set-cookie']
      ? res.headers['set-cookie'].map(v => v.split(';')[0]).join('; ')
      : ''
  };
}

async function postUrl(url, csrf, cookie) {
  const res = await axios.post('https://savett.cc/en1/download', 
    'csrf_token=' + encodeURIComponent(csrf) + '&url=' + encodeURIComponent(url),
    { 
      headers: { 
        ...headers, 
        Cookie: cookie,
        'Content-Length': String(('csrf_token=' + encodeURIComponent(csrf) + '&url=' + encodeURIComponent(url)).length)
      } 
    }
  );
  return res.data;
}

function parseHtml(html) {
  const $ = cheerio.load(html);
  
  const stats = [];
  $('#video-info .my-1 span').each((_, el) => {
    const text = $(el).text().trim();
    if (text) stats.push(text);
  });

  const username = $('#video-info h3').first().text().trim();
  
  const description = $('#video-info p.text-muted')
    .filter((_, el) => {
      return !$(el).text().toLowerCase().includes('duration');
    })
    .first()
    .text()
    .trim() || null;

  const postedAt = $('.text-muted small')
    .first()
    .text()
    .trim() || null;

  const data = {
    username: username || null,
    description: description,
    postedAt: postedAt,
    views: stats[0] || '0',
    likes: stats[1] || '0',
    bookmarks: stats[2] || '0',
    comments: stats[3] || '0',
    shares: stats[4] || '0',
    duration: $('#video-info p.text-muted')
      .filter((_, el) => $(el).text().toLowerCase().includes('duration'))
      .first()
      .text()
      .replace(/Duration:/i, '')
      .trim() || null,
    type: 'video',
    downloads: { 
      nowm: [], 
      wm: [] 
    },
    mp3: [],
    slides: [],
    thumbnail: null,
    music: null,
    music_author: null
  };

  const thumbnailImg = $('img[src*="tiktok"]').first().attr('src');
  if (thumbnailImg) {
    data.thumbnail = thumbnailImg;
  }

  const musicInfo = $('.music-info').first();
  if (musicInfo.length) {
    const musicText = musicInfo.text().trim();
    const musicParts = musicText.split(' - ');
    if (musicParts.length === 2) {
      data.music = musicParts[1]?.trim() || null;
      data.music_author = musicParts[0]?.trim() || null;
    }
  }

  const slides = $('.carousel-item[data-data]');
  if (slides.length) {
    data.type = 'photo';
    slides.each((_, el) => {
      try {
        const rawData = $(el).attr('data-data');
        if (!rawData) return;
        
        const json = JSON.parse(rawData.replace(/&quot;/g, '"'));
        if (Array.isArray(json.URL)) {
          json.URL.forEach(url => {
            data.slides.push({ 
              index: data.slides.length + 1, 
              url: url 
            });
          });
        }
      } catch (e) {}
    });
    return data;
  }

  $('#formatselect option').each((_, el) => {
    const label = $(el).text().toLowerCase();
    const raw = $(el).attr('value');
    if (!raw) return;

    try {
      const json = JSON.parse(raw.replace(/&quot;/g, '"'));
      if (!json.URL) return;

      const urls = Array.isArray(json.URL) ? json.URL : [json.URL];

      if (label.includes('mp4') && !label.includes('watermark')) {
        data.downloads.nowm.push(...urls);
      }
      if (label.includes('watermark') || label.includes('wm')) {
        data.downloads.wm.push(...urls);
      }
      if (label.includes('mp3') || label.includes('audio')) {
        data.mp3.push(...urls);
      }
    } catch (e) {}
  });

  if (data.downloads.nowm.length === 0 && data.downloads.wm.length === 0) {
    $('a[href*="tiktok"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('.mp4')) {
        if (href.includes('watermark')) {
          data.downloads.wm.push(href);
        } else {
          data.downloads.nowm.push(href);
        }
      }
    });
  }

  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = req.method === 'GET' ? req.query.url : req.body?.url;

  if (!url) {
    return res.status(400).json({ 
      error: 'URL is required',
      message: 'Please provide a TikTok video URL'
    });
  }

  if (!url.includes('tiktok.com') && !url.includes('vt.tiktok')) {
    return res.status(400).json({
      error: 'Invalid URL',
      message: 'Please provide a valid TikTok URL'
    });
  }

  try {
    const { csrf, cookie } = await getCsrf();
    
    if (!csrf) {
      throw new Error('Failed to get CSRF token');
    }

    const html = await postUrl(url, csrf, cookie);
    const result = parseHtml(html);
    
    if (!result.username && result.slides.length === 0) {
      throw new Error('Failed to parse content or video not found');
    }

    const response = {
      success: true,
      data: result,
      metadata: {
        platform: 'TikTok',
        scraped_at: new Date().toISOString(),
        source: 'savett.cc'
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error:', error.message);
    
    let statusCode = 500;
    let errorMessage = 'Failed to download video';
    
    if (error.response?.status === 404) {
      statusCode = 404;
      errorMessage = 'Video not found or private';
    } else if (error.response?.status === 429) {
      statusCode = 429;
      errorMessage = 'Rate limit exceeded. Please try again later';
    } else if (error.code === 'ECONNABORTED') {
      statusCode = 504;
      errorMessage = 'Request timeout';
    }

    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
};
