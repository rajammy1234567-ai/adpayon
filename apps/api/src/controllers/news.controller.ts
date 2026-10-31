import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { NewsArticle } from '../models/NewsArticle';
import { logger } from '../config/logger';

function isValidHttpUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Public/authenticated endpoint to fetch the admin-curated news feed.
 * No scraping, no third-party news API keys; local database-backed items only.
 */
export async function getNewsFeed(_req: Request, res: Response): Promise<void> {
  try {
    const articles = await NewsArticle.find({ isPublished: true })
      .sort({ priority: -1, publishedAt: -1 })
      .limit(20)
      .lean();

    const formatted = articles.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      source: doc.source,
      url: doc.url,
      category: doc.category,
      publishedAt: doc.publishedAt,
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to retrieve news feed');
    res.status(500).json({
      success: false,
      error: {
        code: 'NEWS_FEED_FETCH_FAILED',
        message: 'Unable to retrieve news updates at this time.',
      },
    });
  }
}

/**
 * Admin: List all news articles (both published and drafts).
 */
export async function listAllNewsAdmin(_req: Request, res: Response): Promise<void> {
  try {
    const articles = await NewsArticle.find()
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    const formatted = articles.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      source: doc.source,
      url: doc.url,
      category: doc.category,
      isPublished: doc.isPublished,
      priority: doc.priority,
      publishedAt: doc.publishedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin failed to list news articles');
    res.status(500).json({
      success: false,
      error: {
        code: 'ADMIN_NEWS_LIST_FAILED',
        message: 'Unable to retrieve news articles list.',
      },
    });
  }
}

/**
 * Admin: Create a new curated news article.
 */
export async function createNewsArticle(req: Request, res: Response): Promise<void> {
  try {
    const { title, summary, source, url, category, priority, isPublished } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TITLE', message: 'Article title is required.' },
      });
      return;
    }

    if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SUMMARY', message: 'Article summary is required.' },
      });
      return;
    }

    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SOURCE', message: 'Article source publication name is required.' },
      });
      return;
    }

    if (!url || typeof url !== 'string' || !isValidHttpUrl(url.trim())) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_URL', message: 'A valid http:// or https:// URL is required.' },
      });
      return;
    }

    const article = new NewsArticle({
      title: title.trim(),
      summary: summary.trim(),
      source: source.trim(),
      url: url.trim(),
      category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : 'announcement',
      priority: typeof priority === 'number' ? priority : 0,
      isPublished: isPublished === undefined ? true : Boolean(isPublished),
      publishedAt: new Date(),
    });

    await article.save();

    logger.info({ articleId: article._id, title: article.title }, 'Admin created news article');

    res.status(201).json({
      success: true,
      data: {
        id: article._id.toString(),
        title: article.title,
        summary: article.summary,
        source: article.source,
        url: article.url,
        category: article.category,
        isPublished: article.isPublished,
        priority: article.priority,
        publishedAt: article.publishedAt,
        createdAt: article.createdAt,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin failed to create news article');
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_NEWS_FAILED',
        message: error.message || 'Unable to create news article.',
      },
    });
  }
}

/**
 * Admin: Update an existing news article.
 */
export async function updateNewsArticle(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid article ID.' },
      });
      return;
    }

    const article = await NewsArticle.findById(id);
    if (!article) {
      res.status(404).json({
        success: false,
        error: { code: 'ARTICLE_NOT_FOUND', message: 'News article not found.' },
      });
      return;
    }

    const { title, summary, source, url, category, priority, isPublished } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_TITLE', message: 'Article title cannot be empty.' },
        });
        return;
      }
      article.title = title.trim();
    }

    if (summary !== undefined) {
      if (typeof summary !== 'string' || summary.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_SUMMARY', message: 'Article summary cannot be empty.' },
        });
        return;
      }
      article.summary = summary.trim();
    }

    if (source !== undefined) {
      if (typeof source !== 'string' || source.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_SOURCE', message: 'Article source cannot be empty.' },
        });
        return;
      }
      article.source = source.trim();
    }

    if (url !== undefined) {
      if (typeof url !== 'string' || !isValidHttpUrl(url.trim())) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_URL', message: 'A valid http:// or https:// URL is required.' },
        });
        return;
      }
      article.url = url.trim();
    }

    if (category !== undefined && typeof category === 'string') {
      article.category = category.trim();
    }

    if (priority !== undefined && typeof priority === 'number') {
      article.priority = priority;
    }

    if (isPublished !== undefined) {
      article.isPublished = Boolean(isPublished);
    }

    await article.save();

    res.status(200).json({
      success: true,
      data: {
        id: article._id.toString(),
        title: article.title,
        summary: article.summary,
        source: article.source,
        url: article.url,
        category: article.category,
        isPublished: article.isPublished,
        priority: article.priority,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin failed to update news article');
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_NEWS_FAILED',
        message: error.message || 'Unable to update news article.',
      },
    });
  }
}

/**
 * Admin: Publish an article.
 */
export async function publishNewsArticle(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid article ID.' },
      });
      return;
    }

    const article = await NewsArticle.findByIdAndUpdate(
      id,
      { isPublished: true, publishedAt: new Date() },
      { new: true }
    );

    if (!article) {
      res.status(404).json({
        success: false,
        error: { code: 'ARTICLE_NOT_FOUND', message: 'News article not found.' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: article._id.toString(),
        isPublished: article.isPublished,
        publishedAt: article.publishedAt,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin failed to publish news article');
    res.status(500).json({
      success: false,
      error: { code: 'PUBLISH_NEWS_FAILED', message: 'Unable to publish news article.' },
    });
  }
}

/**
 * Admin: Unpublish an article.
 */
export async function unpublishNewsArticle(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid article ID.' },
      });
      return;
    }

    const article = await NewsArticle.findByIdAndUpdate(
      id,
      { isPublished: false },
      { new: true }
    );

    if (!article) {
      res.status(404).json({
        success: false,
        error: { code: 'ARTICLE_NOT_FOUND', message: 'News article not found.' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: article._id.toString(),
        isPublished: article.isPublished,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin failed to unpublish news article');
    res.status(500).json({
      success: false,
      error: { code: 'UNPUBLISH_NEWS_FAILED', message: 'Unable to unpublish news article.' },
    });
  }
}

/**
 * Admin: Delete a news article.
 */
export async function deleteNewsArticle(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid article ID.' },
      });
      return;
    }

    const deleted = await NewsArticle.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'ARTICLE_NOT_FOUND', message: 'News article not found.' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'News article deleted successfully.',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Admin failed to delete news article');
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_NEWS_FAILED', message: 'Unable to delete news article.' },
    });
  }
}
