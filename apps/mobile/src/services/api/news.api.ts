import { apiClient } from './client';

export interface NewsArticleItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  category?: string;
  publishedAt: string;
}

export interface NewsFeedResponse {
  success: boolean;
  data: NewsArticleItem[];
}

export async function fetchNewsFeedApi(): Promise<NewsArticleItem[]> {
  const response = await apiClient<NewsFeedResponse>('/news', {
    method: 'GET',
    requiresAuth: false,
  });
  return response.data || [];
}

