/**
 * Client-side HTML5 Canvas Image Optimizer
 * Compresses and resizes images before upload to save bandwidth and storage.
 */

export interface OptimizeOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number; // 0 to 1
    type?: 'image/webp' | 'image/jpeg';
}

export const optimizeImage = (file: File, options: OptimizeOptions = {}): Promise<File> => {
    return new Promise((resolve, reject) => {
        // Skip optimization for non-images (like PDFs, SVGs, GIFs)
        if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
            return resolve(file);
        }

        const {
            maxWidth = 1920,
            maxHeight = 1080,
            quality = 0.8,
            type = 'image/webp',
        } = options;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Calculate the new dimensions while preserving aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                // Create a canvas and draw the resized image
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    return resolve(file); // Fallback to original if canvas fails
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert canvas back to a Blob/File
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFilename = file.name.replace(/\.[^/.]+$/, "") + (type === 'image/webp' ? '.webp' : '.jpg');
                        const optimizedFile = new File([blob], newFilename, {
                            type: type,
                            lastModified: Date.now(),
                        });
                        resolve(optimizedFile);
                    } else {
                        resolve(file); // Fallback
                    }
                }, type, quality);
            };
            img.onerror = () => reject(new Error('Failed to load image for optimization'));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
    });
};
