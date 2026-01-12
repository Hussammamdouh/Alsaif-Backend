/**
 * SEO Service
 *
 * Generates meta tags, sitemaps, and structured data for insights
 */

const logger = require('../utils/logger');

class SeoService {
  /**
   * Generate meta tags for an insight
   */
  generateMetaTags(insight, baseUrl = process.env.FRONTEND_URL || 'https://elsaif.com') {
    const url = `${baseUrl}/insights/${insight._id}`;
    const imageUrl = insight.featuredImage ? `${baseUrl}${insight.featuredImage}` : `${baseUrl}/default-og-image.jpg`;

    return {
      // Basic meta tags
      title: this.generateTitle(insight),
      description: this.generateDescription(insight),
      keywords: this.generateKeywords(insight),
      canonical: url,

      // Open Graph (Facebook, LinkedIn)
      og: {
        'og:type': 'article',
        'og:title': insight.title,
        'og:description': insight.excerpt || this.truncateText(insight.content, 200),
        'og:url': url,
        'og:image': imageUrl,
        'og:site_name': 'ElSaif Stock Insights',
        'article:published_time': insight.publishedAt?.toISOString(),
        'article:modified_time': insight.updatedAt?.toISOString(),
        'article:author': insight.author?.name || 'ElSaif',
        'article:section': insight.category,
        'article:tag': insight.tags?.join(', ')
      },

      // Twitter Card
      twitter: {
        'twitter:card': 'summary_large_image',
        'twitter:title': insight.title,
        'twitter:description': insight.excerpt || this.truncateText(insight.content, 200),
        'twitter:image': imageUrl,
        'twitter:site': '@ElSaif',
        'twitter:creator': '@ElSaif'
      }
    };
  }

  /**
   * Generate structured data (Schema.org JSON-LD)
   */
  generateStructuredData(insight, baseUrl = process.env.FRONTEND_URL || 'https://elsaif.com') {
    const url = `${baseUrl}/insights/${insight._id}`;
    const imageUrl = insight.featuredImage ? `${baseUrl}${insight.featuredImage}` : undefined;

    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: insight.title,
      description: insight.excerpt || this.truncateText(insight.content, 200),
      image: imageUrl,
      datePublished: insight.publishedAt?.toISOString(),
      dateModified: insight.updatedAt?.toISOString(),
      author: {
        '@type': 'Organization',
        name: 'ElSaif Stock Insights',
        url: baseUrl
      },
      publisher: {
        '@type': 'Organization',
        name: 'ElSaif Stock Insights',
        url: baseUrl,
        logo: {
          '@type': 'ImageObject',
          url: `${baseUrl}/logo.png`
        }
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': url
      },
      keywords: insight.tags?.join(', '),
      articleSection: insight.category,
      inLanguage: 'en-US'
    };
  }

  /**
   * Generate sitemap XML
   */
  async generateSitemap(insights, baseUrl = process.env.FRONTEND_URL || 'https://elsaif.com') {
    const urls = insights.map(insight => {
      const priority = this.calculatePriority(insight);
      const changefreq = this.calculateChangeFreq(insight);

      return `
  <url>
    <loc>${baseUrl}/insights/${insight._id}</loc>
    <lastmod>${insight.updatedAt?.toISOString().split('T')[0]}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/insights</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>${urls}
</urlset>`;

    return xml;
  }

  /**
   * Generate robots.txt
   */
  generateRobotsTxt(baseUrl = process.env.FRONTEND_URL || 'https://elsaif.com') {
    return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /uploads/private

Sitemap: ${baseUrl}/sitemap.xml
`;
  }

  /**
   * Calculate SEO priority based on insight metrics
   */
  calculatePriority(insight) {
    let priority = 0.5;

    // Boost for high views
    if (insight.analytics?.views > 1000) priority += 0.2;
    else if (insight.analytics?.views > 500) priority += 0.1;

    // Boost for high engagement
    const engagementRate = insight.analytics?.views > 0
      ? (insight.analytics?.likes + insight.analytics?.comments) / insight.analytics?.views
      : 0;
    if (engagementRate > 0.1) priority += 0.1;

    // Boost for recent content
    const daysSincePublished = (Date.now() - new Date(insight.publishedAt)) / (1000 * 60 * 60 * 24);
    if (daysSincePublished < 7) priority += 0.2;

    return Math.min(priority, 1.0).toFixed(1);
  }

  /**
   * Calculate change frequency
   */
  calculateChangeFreq(insight) {
    const daysSinceUpdated = (Date.now() - new Date(insight.updatedAt)) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdated < 1) return 'hourly';
    if (daysSinceUpdated < 7) return 'daily';
    if (daysSinceUpdated < 30) return 'weekly';
    if (daysSinceUpdated < 180) return 'monthly';
    return 'yearly';
  }

  /**
   * Generate page title
   */
  generateTitle(insight) {
    return `${insight.title} | ElSaif Stock Insights`;
  }

  /**
   * Generate meta description
   */
  generateDescription(insight) {
    if (insight.excerpt) {
      return this.truncateText(insight.excerpt, 160);
    }
    return this.truncateText(insight.content, 160);
  }

  /**
   * Generate keywords
   */
  generateKeywords(insight) {
    const keywords = [...(insight.tags || [])];
    keywords.push(insight.category);
    keywords.push('stock insights', 'market analysis', 'investing');
    return keywords.join(', ');
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    const cleanText = text.replace(/<[^>]*>/g, ''); // Remove HTML tags
    if (cleanText.length <= maxLength) return cleanText;
    return cleanText.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate breadcrumb structured data
   */
  generateBreadcrumb(insight, baseUrl = process.env.FRONTEND_URL || 'https://elsaif.com') {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: baseUrl
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Insights',
          item: `${baseUrl}/insights`
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: insight.category,
          item: `${baseUrl}/insights?category=${insight.category}`
        },
        {
          '@type': 'ListItem',
          position: 4,
          name: insight.title,
          item: `${baseUrl}/insights/${insight._id}`
        }
      ]
    };
  }
}

module.exports = new SeoService();
