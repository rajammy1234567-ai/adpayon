import { Request, Response } from 'express';
import { VideoContent } from '../models/VideoContent';
import { pointsToUsd } from '@adpayon/shared';

// Public/User: List published videos
export async function getPublishedVideos(req: Request, res: Response): Promise<void> {
  try {
    const { category } = req.query;
    const filter: any = { isPublished: true };
    if (category && category !== 'ALL') {
      filter.category = category;
    }

    const videos = await VideoContent.find(filter).sort({ displayOrder: 1, createdAt: -1 });

    res.json({
      success: true,
      data: videos.map((v) => ({
        id: v._id.toString(),
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        videoUrl: v.videoUrl,
        category: v.category,
        durationSeconds: v.durationSeconds,
        instructions: v.instructions,
        rewardPoints: v.rewardPoints,
        usdValue: pointsToUsd(v.rewardPoints),
        isRewardBearing: v.isRewardBearing,
        isPublished: v.isPublished,
        displayOrder: v.displayOrder,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: List all videos
export async function adminListVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await VideoContent.find().sort({ displayOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: videos.map((v) => ({
        id: v._id.toString(),
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        videoUrl: v.videoUrl,
        category: v.category,
        durationSeconds: v.durationSeconds,
        instructions: v.instructions,
        rewardPoints: v.rewardPoints,
        usdValue: pointsToUsd(v.rewardPoints),
        isRewardBearing: v.isRewardBearing,
        isPublished: v.isPublished,
        displayOrder: v.displayOrder,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Create video
export async function adminCreateVideo(req: Request, res: Response): Promise<void> {
  try {
    const {
      title,
      thumbnailUrl,
      videoUrl,
      category,
      durationSeconds,
      instructions,
      rewardPoints,
      isRewardBearing,
      isPublished,
      displayOrder,
    } = req.body;

    if (!title || !thumbnailUrl || !videoUrl) {
      res.status(400).json({ success: false, error: { message: 'Title, thumbnailUrl, and videoUrl are required' } });
      return;
    }

    const points = Number(rewardPoints) || 0;
    const video = new VideoContent({
      title,
      thumbnailUrl,
      videoUrl,
      category: category || 'General',
      durationSeconds: Number(durationSeconds) || 60,
      instructions: Array.isArray(instructions) ? instructions : [],
      rewardPoints: points,
      usdValue: pointsToUsd(points),
      isRewardBearing: Boolean(isRewardBearing),
      isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
      displayOrder: Number(displayOrder) || 0,
    });
    await video.save();

    res.status(201).json({
      success: true,
      data: {
        id: video._id.toString(),
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        videoUrl: video.videoUrl,
        category: video.category,
        durationSeconds: video.durationSeconds,
        instructions: video.instructions,
        rewardPoints: video.rewardPoints,
        usdValue: video.usdValue,
        isRewardBearing: video.isRewardBearing,
        isPublished: video.isPublished,
        displayOrder: video.displayOrder,
        createdAt: video.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Update video
export async function adminUpdateVideo(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const video = await VideoContent.findById(id);
    if (!video) {
      res.status(404).json({ success: false, error: { message: 'Video not found' } });
      return;
    }

    const {
      title,
      thumbnailUrl,
      videoUrl,
      category,
      durationSeconds,
      instructions,
      rewardPoints,
      isRewardBearing,
      isPublished,
      displayOrder,
    } = req.body;

    if (title !== undefined) video.title = title;
    if (thumbnailUrl !== undefined) video.thumbnailUrl = thumbnailUrl;
    if (videoUrl !== undefined) video.videoUrl = videoUrl;
    if (category !== undefined) video.category = category;
    if (durationSeconds !== undefined) video.durationSeconds = Number(durationSeconds);
    if (instructions !== undefined) video.instructions = instructions;
    if (rewardPoints !== undefined) {
      video.rewardPoints = Number(rewardPoints);
      video.usdValue = pointsToUsd(video.rewardPoints);
    }
    if (isRewardBearing !== undefined) video.isRewardBearing = Boolean(isRewardBearing);
    if (isPublished !== undefined) video.isPublished = Boolean(isPublished);
    if (displayOrder !== undefined) video.displayOrder = Number(displayOrder);

    await video.save();
    res.json({ success: true, data: video });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Delete video
export async function adminDeleteVideo(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await VideoContent.findByIdAndDelete(id);
    res.json({ success: true, message: 'Video deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

