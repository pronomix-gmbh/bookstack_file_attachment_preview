const loaderScript = document.currentScript;
const workerUrl = loaderScript && loaderScript.src
  ? new URL('heic-preview-worker.min.js', loaderScript.src)
  : null;

window.AttachmentPreviewHeic = {
  decode: (bytes) => new Promise((resolve, reject) => {
    if (!workerUrl || typeof window.Worker !== 'function') {
      reject(new Error('This browser cannot run the HEIC image decoder'));
      return;
    }

    const worker = new window.Worker(workerUrl, {name: 'BookStack HEIC preview'});
    const finish = (error, image) => {
      worker.terminate();
      if (error) reject(error);
      else resolve(image);
    };
    worker.addEventListener('message', (event) => {
      if (event.data && event.data.error) finish(new Error(event.data.error));
      else finish(null, event.data);
    }, {once: true});
    worker.addEventListener('error', () => finish(new Error('The HEIC image could not be decoded')), {once: true});
    worker.addEventListener('messageerror', () => finish(new Error('The HEIC decoder returned invalid image data')), {once: true});

    const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    try {
      worker.postMessage(input, [input]);
    } catch (error) {
      finish(error);
    }
  }),
};
