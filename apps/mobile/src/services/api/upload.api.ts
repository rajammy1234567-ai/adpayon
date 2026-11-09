import { API_BASE_URL } from './config';
import { getAccessToken } from './client';

export interface ProofUploadResponse {
  fileId: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export async function uploadProofScreenshotApi(
  fileData: File | Blob | { uri: string; name?: string; type?: string }
): Promise<ProofUploadResponse> {
  const token = getAccessToken();
  const formData = new FormData();

  if (fileData instanceof File || fileData instanceof Blob) {
    formData.append('file', fileData);
  } else {
    // React Native native file asset
    formData.append('file', {
      uri: fileData.uri,
      name: fileData.name || 'proof.jpg',
      type: fileData.type || 'image/jpeg',
    } as any);
  }

  const response = await fetch(`${API_BASE_URL}/uploads/proof`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || 'Failed to upload screenshot proof');
  }

  return json.data;
}

