import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { load } from 'cheerio';

function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

function extractTitleFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    // Amazon URLs: /{title-slug}/dp/{ASIN} or /dp/{ASIN}
    const m = path.match(/^\/(.+?)\/(?:dp|gp\/product)\//i);
    if (!m?.[1]) return null;
    const slug = m[1];
    // Ignore generic path segments
    if (/^[A-Z0-9]{10}$/i.test(slug)) return null;
    return slug
      .split('-')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
      .substring(0, 120);
  } catch {
    return null;
  }
}

function isAmazonUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname.includes('amazon.');
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL manquante.' }, { status: 400 });
  }

  if (!isAmazonUrl(url)) {
    return NextResponse.json(
      { error: 'Lien invalide. Utilise un lien Amazon (amazon.fr, amazon.com, etc.).' },
      { status: 400 }
    );
  }

  const asin = extractAsin(url);
  if (!asin) {
    return NextResponse.json(
      { error: 'Impossible de trouver le produit dans ce lien. Copie l\'URL directe depuis la page produit.' },
      { status: 400 }
    );
  }

  // Prefer amazon.fr for price/UX consistency; fall back to .com
  const domain = url.includes('amazon.fr') ? 'amazon.fr' : 'amazon.com';
  const productUrl = `https://www.${domain}/dp/${asin}`;

  const urlTitle = extractTitleFromUrl(url);

  const fallback = {
    asin,
    title: urlTitle,
    price: null,
    image: null,
    rating: null,
    reviewCount: null,
    negativeReviews: [],
    description: null,
    url: productUrl,
    scrapeFailed: true,
  };

  const HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    DNT: '1',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };

  function isBlocked(html: string) {
    return (
      html.includes('robot') ||
      html.includes('captcha') ||
      html.includes('Type the characters') ||
      html.includes('Enter the characters you see below') ||
      html.includes('Sorry, we just need to make sure')
    );
  }

  function parseProductHtml(html: string) {
    const $ = load(html);

    const title =
      $('#productTitle').text().trim() ||
      $('h1.product-title-word-break').text().trim() ||
      $('[data-feature-name="title"] h1').text().trim() ||
      $('h1').first().text().trim() ||
      null;

    const priceText =
      $('.a-price .a-offscreen').first().text().trim() ||
      $('#priceblock_ourprice').text().trim() ||
      $('#priceblock_dealprice').text().trim() ||
      $('.a-price-whole').first().text().trim() ||
      null;

    const image =
      $('#landingImage').attr('src') ||
      $('#imgTagWrappingLink img').attr('src') ||
      $('[data-a-dynamic-image]')
        .attr('data-a-dynamic-image')
        ?.match(/"(https[^"]+)"/)?.[1] ||
      null;

    const rating =
      $('#acrPopover').attr('title') ||
      $('span.a-icon-alt').first().text().trim() ||
      null;

    const reviewCount = $('#acrCustomerReviewText').text().trim() || null;

    const bullets: string[] = [];
    $('#feature-bullets .a-list-item').each((_, el) => {
      const text = $(el).text().trim();
      if (text && bullets.length < 6) bullets.push(text);
    });

    const description =
      $('#productDescription p').text().trim().substring(0, 600) ||
      bullets.join(' ').substring(0, 600) ||
      null;

    return { title, priceText, image, rating, reviewCount, description };
  }

  // Attempt 1: desktop page
  try {
    const { data: html } = await axios.get(productUrl, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 5,
    });

    if (!isBlocked(html)) {
      const { title, priceText, image, rating, reviewCount, description } = parseProductHtml(html);
      if (title || priceText) {
        return NextResponse.json({
          asin,
          title,
          price: priceText,
          image,
          rating,
          reviewCount,
          negativeReviews: [],
          description,
          url: productUrl,
          scrapeFailed: false,
        });
      }
    }
  } catch {
    // fall through to mobile attempt
  }

  // Attempt 2: mobile site (less aggressive bot detection)
  try {
    const mobileUrl = `https://m.${domain}/dp/${asin}`;
    const { data: html } = await axios.get(mobileUrl, {
      headers: {
        ...HEADERS,
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
      maxRedirects: 5,
    });

    if (!isBlocked(html)) {
      const $ = load(html);
      const title =
        $('h1').first().text().trim() ||
        $('[class*="product-title"]').first().text().trim() ||
        null;
      const priceText =
        $('[class*="price"]').first().text().trim() ||
        null;
      if (title || priceText) {
        return NextResponse.json({
          asin,
          title: title || urlTitle,
          price: priceText,
          image: null,
          rating: null,
          reviewCount: null,
          negativeReviews: [],
          description: null,
          url: productUrl,
          scrapeFailed: false,
        });
      }
    }
  } catch {
    // fall through to fallback
  }

  return NextResponse.json(fallback);
}
