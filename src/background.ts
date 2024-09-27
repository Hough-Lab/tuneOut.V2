// background service worker
import { Buffer } from 'buffer';

let recorder: MediaRecorder | undefined;
let streamObject: MediaStream | undefined;
let previousRequest: any;

const error = {
  noAudibleTab: 'Please select an audible tab'
};

async function toBuffer(stream: Blob): Promise<Buffer> {
  const arrayBuffer = await stream.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function shazamFromBlob(blob: Blob): Promise<any> {
  try {
    // Convert the Blob to a Buffer
    const mp3Buffer = await toBuffer(blob);

    // Call Shazam's recognize function with the Buffer directly
    // console.log(recognise);
    return mp3Buffer;
  } catch (error) {
    console.error('Error recognizing audio:', error);
    throw error;
  }
}

async function handleCapture(
  stream: MediaStream,
  muteTab?: boolean
): Promise<any> {
  const options = { mimeType: 'audio/webm; codecs=opus' };
  recorder = new MediaRecorder(stream, options);
  streamObject = stream;
  recorder.start();

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      recorder?.stop();
      streamObject?.getAudioTracks()[0].stop();
      resolve();
    }, 8000);
  }).then(
    () =>
      new Promise<any>((resolve) => {
        recorder!.ondataavailable = async (e: BlobEvent) => {
          console.log('Data available', e.data);
          const blob = new Blob([e.data], { type: 'audio/mp3' });
          const data = await shazamFromBlob(blob);
          resolve(data);
        };
      })
  );
}

export async function captureTab(tabId: number): Promise<any> {
  const stream = await new Promise<MediaStream>((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true }, (stream) => {
      console.log('stream', stream, tabId);
      if (!stream) {
        reject(new Error(error.noAudibleTab));
      } else {
        resolve(stream);
      }
    });
  });

  const audio = new Audio();
  audio.srcObject = stream;
  await audio.play();

  const data = await handleCapture(stream);
  previousRequest = data;
  return data;
}

export async function sendHistory(): Promise<any> {
  if (!previousRequest) throw new Error('No previous request available');
  return previousRequest;
}
