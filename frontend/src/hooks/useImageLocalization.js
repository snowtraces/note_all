import { useState, useCallback, useRef } from 'react';
import { uploadImage, uploadImageFromUrl } from '../api/noteApi';

const inferMimeType = (url) => {
  const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0];
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
  };
  return mimeMap[ext] || 'image/png';
};

const detectImages = (text) => {
  if (!text) return { external: [], local: [] };
  const mdImgRegex = /!\[.*?\]\(([^)]+)\)/g;
  const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  const external = [];
  const local = [];

  let match;
  while ((match = mdImgRegex.exec(text)) !== null) {
    const url = match[1];
    if (url.startsWith('/api/file/')) {
      local.push({ url, mimeType: inferMimeType(url) });
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      external.push({ url, mimeType: inferMimeType(url) });
    }
  }
  while ((match = htmlImgRegex.exec(text)) !== null) {
    const url = match[1];
    if (url.startsWith('/api/file/')) {
      local.push({ url, mimeType: inferMimeType(url) });
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      external.push({ url, mimeType: inferMimeType(url) });
    }
  }
  return { external, local };
};

const fetchImageAsBase64 = async (url, mimeType = 'image/png') => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL(mimeType);
      const base64Data = dataUrl.split(',')[1];
      resolve({ data: base64Data, mimeType });
    };
    img.onerror = () => {
      reject(new Error(`无法加载图片: ${url}`));
    };
    img.src = url;
  });
};

export default function useImageLocalization(onSave, onLocalUpdate) {
  const [externalImages, setExternalImages] = useState([]);
  const [localImages, setLocalImages] = useState([]);
  const [localizingProgress, setLocalizingProgress] = useState(0);
  const [totalImagesToLocalize, setTotalImagesToLocalize] = useState(0);
  const [isLocalizing, setIsLocalizing] = useState(false);

  const editValueRef = useRef('');
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onLocalUpdateRef = useRef(onLocalUpdate);
  onLocalUpdateRef.current = onLocalUpdate;

  const refreshDetection = useCallback((text) => {
    const { external, local } = detectImages(text);
    setExternalImages(external);
    setLocalImages(local);
    setLocalizingProgress(0);
    setTotalImagesToLocalize(0);
  }, []);

  const localizeImages = useCallback(async () => {
    if (!externalImages.length || isLocalizing) return;

    setIsLocalizing(true);
    setLocalizingProgress(0);
    setTotalImagesToLocalize(externalImages.length);

    let updatedText = editValueRef.current;
    let useBackendProxy = false;

    for (let i = 0; i < externalImages.length; i++) {
      const { url: originalUrl, mimeType: originalMimeType } = externalImages[i];
      try {
        let newUrl;

        if (!useBackendProxy) {
          try {
            const { data, mimeType } = await fetchImageAsBase64(originalUrl, originalMimeType);
            const result = await uploadImage(data, mimeType);
            newUrl = result.url;
          } catch (frontendErr) {
            console.warn(`浏览器获取失败，切换后端代理: ${originalUrl}`, frontendErr);
            useBackendProxy = true;
            const result = await uploadImageFromUrl(originalUrl, originalMimeType);
            newUrl = result.url;
          }
        } else {
          const result = await uploadImageFromUrl(originalUrl, originalMimeType);
          newUrl = result.url;
        }

        updatedText = updatedText.replace(
          new RegExp(`!\\[([^\\]]*)\\]\\(${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
          `![$1](${newUrl})`
        );
        updatedText = updatedText.replace(
          new RegExp(`<img([^>]*)src=["']${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']([^>]*)>`, 'gi'),
          `<img$1src="${newUrl}"$2>`
        );

        setLocalizingProgress(i + 1);
      } catch (err) {
        console.error(`图片本地化失败: ${originalUrl}`, err);
        setLocalizingProgress(i + 1);
      }
    }

    // 立即更新本地 UI 状态
    if (onLocalUpdateRef.current) {
      onLocalUpdateRef.current(updatedText);
    }

    // 保存到服务器
    try {
      if (onSaveRef.current) {
        await onSaveRef.current(updatedText);
      }
    } catch (err) {
      console.error('保存本地化结果失败:', err);
    }

    setIsLocalizing(false);
    refreshDetection(updatedText);
  }, [externalImages, isLocalizing, refreshDetection]);

  return {
    externalImages,
    localImages,
    localizingProgress,
    totalImagesToLocalize,
    isLocalizing,
    refreshDetection,
    localizeImages,
    editValueRef,
  };
}