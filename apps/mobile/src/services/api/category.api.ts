import { apiClient } from './client';
import { Category } from '@adpayon/shared';

export interface CategoriesApiResponse {
  success: boolean;
  data: Category[];
}

export interface CategoryDetailApiResponse {
  success: boolean;
  data: Category;
}

export async function getCategoriesApi(): Promise<CategoriesApiResponse> {
  return apiClient<CategoriesApiResponse>('/categories', {
    method: 'GET',
  });
}

export async function getCategoryDetailsApi(idOrSlug: string): Promise<CategoryDetailApiResponse> {
  return apiClient<CategoryDetailApiResponse>(`/categories/${encodeURIComponent(idOrSlug)}`, {
    method: 'GET',
  });
}

