type UploadEntityRequest = {
  endpoint: string;
  entityId: string;
  file: File;
  isPrimary?: boolean;
  imageType?: 'icon' | 'banner' | 'logo';
};

export type UploadEntityResponse = {
  success: true;
  entity_type: string;
  entity_id: string;
  urls: Record<string, string | null>;
};

export async function uploadEntityFile(input: UploadEntityRequest): Promise<UploadEntityResponse> {
  const formData = new FormData();
  formData.append('file', input.file);
  formData.append('entity_id', input.entityId);
  if (input.isPrimary !== undefined) {
    formData.append('is_primary', input.isPrimary ? 'true' : 'false');
  }
  if (input.imageType) {
    formData.append('image_type', input.imageType);
  }

  const response = await fetch(input.endpoint, {
    method: 'POST',
    body: formData,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      json &&
        typeof json === 'object' &&
        'error' in json &&
        typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : 'Image upload failed.',
    );
  }

  return json as UploadEntityResponse;
}
