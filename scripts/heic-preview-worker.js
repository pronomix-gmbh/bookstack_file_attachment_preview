import {decodeHeic, getHeicMetadata} from '@stacksjs/ts-heic';

const MAX_IMAGE_PIXELS = 20 * 1000 * 1000;

self.addEventListener('message', (event) => {
  try {
    const bytes = new Uint8Array(event.data);
    const metadata = getHeicMetadata(bytes);
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new Error('The HEIC image is too large for a safe preview');
    }

    const decoded = decodeHeic(bytes);
    self.postMessage(decoded, [decoded.data.buffer]);
  } catch (error) {
    self.postMessage({error: error && error.message ? error.message : 'The HEIC image could not be decoded'});
  }
});
