import { useCallback, useEffect, useRef, useState } from 'react';
import { isNative } from '../lib/mobileAuth';
import { t } from '../lib/i18n';

type CameraState = 'idle' | 'starting' | 'live' | 'error';

/**
 * Live camera capture — a true "live photo" (no gallery).
 *
 * - Web: getUserMedia viewfinder + capture to canvas (works in any modern
 *   browser over HTTPS).
 * - Native (Capacitor/Android WebView): tries getUserMedia first; if the
 *   WebView can't use the camera it falls back to the native Capacitor
 *   Camera app (100% reliable on all devices).
 *
 * direction: 'user' (front camera, for the person's live photo) or
 * 'environment' (back camera, e.g. photo of the completed work).
 */
export function CameraCapture({
  direction = 'user',
  onCaptured,
  onError,
  idleLabel = t('📷 कैमरा चालू करें'),
  heightClass = 'h-56',
  autoStart = false,
}: {
  direction?: 'user' | 'environment';
  onCaptured: (file: File) => void;
  onError?: (msg: string) => void;
  idleLabel?: string;
  heightClass?: string;
  /** start the camera as soon as the component mounts */
  autoStart?: boolean;
}) {
  const [state, setState] = useState<CameraState>('idle');
  const [errMsg, setErrMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeRef = useRef(false);
  const startRef = useRef<() => void>(() => undefined);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    nativeRef.current = false;
  }, []);

  useEffect(() => stop, [stop]); // cleanup on unmount

  // attach the stream once the <video> element is mounted (state === 'live')
  useEffect(() => {
    if (state !== 'live') return;
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [state]);

  // optional: start the camera automatically on mount
  useEffect(() => {
    if (autoStart) startRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setErrMsg('');
    setState('starting');
    try {
      if (!isNative() || navigator.mediaDevices?.getUserMedia) {
        // browser geolocation-style camera — also used inside Android WebView
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: direction, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        nativeRef.current = false;
        setState('live'); // the effect above attaches the stream to the video
        return;
      }
    } catch {
      /* fall through to the native camera below */
    }
    // native fallback — Capacitor Camera app
    if (isNative()) {
      try {
        const { Camera, CameraDirection } = await import('@capacitor/camera');
        const photo = await Camera.takePhoto({
          quality: 75,
          cameraDirection: direction === 'user' ? CameraDirection.Front : CameraDirection.Rear,
        });
        const resp = await fetch(photo.uri ?? (photo as { webPath?: string }).webPath ?? '');
        const blob = await resp.blob();
        onCaptured(new File([blob], 'live-photo.jpg', { type: 'image/jpeg' }));
        setState('idle');
        return;
      } catch (e) {
        const denied =
          typeof e === 'string'
            ? /denied|denied by user/i.test(e)
            : /permission|denied|cancelled/i.test(String((e as Error)?.message ?? e));
        stop();
        setErrMsg(
          denied
            ? t('कैमरा की अनुमति नहीं मिली। ऐप की सेटिंग्स में Camera की अनुमति दें, फिर दोबारा कोशिश करें।')
            : t('कैमरा चालू नहीं हो पाया। दोबारा कोशिश करें।'),
        );
        onError?.(denied ? t('कैमरा की अनुमति नहीं मिली।') : t('कैमरा चालू नहीं हो पाया।'));
        setState('error');
        return;
      }
    }
    stop();
    setErrMsg(t('इस ब्राउज़र/डिवाइस में कैमरा उपलब्ध नहीं है।'));
    onError?.(t('कैमरा उपलब्ध नहीं है।'));
    setState('error');
  }
  startRef.current = start;

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    if (video.videoWidth === 0) {
      // give the first frame a moment to arrive
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 3000);
        video.addEventListener('loadeddata', () => {
          clearTimeout(t);
          resolve();
        }, { once: true });
      });
    }
    if (video.videoWidth === 0) {
      stop();
      setErrMsg(t('कैमरा अभी तैयार नहीं है। दोबारा कोशिश करें।'));
      setState('error');
      onError?.(t('कैमरा तैयार नहीं है।'));
      return;
    }
    const canvas = document.createElement('canvas');
    // keep a sensible resolution cap (phone uploads on slow networks)
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (direction === 'user') {
      // mirror the preview so the saved photo matches what the user saw
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) return;
    stop();
    setState('idle');
    onCaptured(new File([blob], 'live-photo.jpg', { type: 'image/jpeg' }));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-cream-deep/40">
      {state !== 'live' && (
        <div className={`flex flex-col items-center justify-center gap-3 px-4 ${heightClass}`}>
          {state === 'error' ? (
            <>
              <p className="text-center text-sm font-medium text-danger">{errMsg}</p>
              <button
                type="button"
                onClick={start}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >{t('दोबारा कोशिश करें')}</button>
            </>
          ) : (
            <>
              <span className="text-3xl">{direction === 'user' ? '🤳' : '📷'}</span>
              <p className="text-center text-sm text-ink-soft">
                {state === 'starting' ? t('कैमरा चालू हो रहा है…') : t('लाइव कैमरा से फोटो ली जाएगी')}
              </p>
              <button
                type="button"
                onClick={start}
                disabled={state === 'starting'}
                className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {state === 'starting' ? t('चालू हो रहा है…') : idleLabel}
              </button>
            </>
          )}
        </div>
      )}

      {state === 'live' && (
        <div>
          <div className={`relative ${heightClass}`}>
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${direction === 'user' ? '-scale-x-100' : ''}`}
            />
          </div>
          <div className="flex items-center justify-center gap-3 p-3">
            <button
              type="button"
              onClick={capture}
              className="rounded-xl bg-employer px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >{t('📸 फोटो लें')}</button>
            <button
              type="button"
              onClick={() => {
                stop();
                setState('idle');
              }}
              className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-cream"
            >{t('बंद करें')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
