import api from '@/lib/api';

export type ProgressFn = (percent: number) => void;

/**
 * Envoie un fichier directement vers R2 via un lien signé (PUT), avec progression.
 * Le fichier ne passe pas par le serveur NeedCreator : pas de limite de taille du proxy.
 */
export function putToSignedUrl(uploadUrl: string, file: File, onProgress?: ProgressFn): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Envoi refusé par le stockage (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Envoi interrompu : vérifiez votre connexion et réessayez'));
    xhr.onabort = () => reject(new Error('Envoi annulé'));
    xhr.send(file);
  });
}

/**
 * Demande un lien d'envoi au backend puis dépose le fichier. Retourne la clé R2 du fichier.
 */
export async function directUpload(endpoint: string, file: File, onProgress?: ProgressFn): Promise<{ key: string; url: string }> {
  const { data } = await api.post(endpoint, { filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size });
  await putToSignedUrl(data.uploadUrl, file, onProgress);
  return { key: data.key, url: data.url };
}
