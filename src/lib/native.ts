'use client';

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require('@capacitor/core') as typeof import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function initNative(navigate: (path: string) => void): Promise<void> {
  if (!isNative()) return;

  const [
    { SplashScreen },
    { StatusBar, Style },
    { PushNotifications },
    { App },
  ] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/push-notifications'),
    import('@capacitor/app'),
  ]);

  await SplashScreen.hide();

  await StatusBar.setStyle({ style: Style.Default }).catch(() => {});

  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive === 'granted') {
    await PushNotifications.register();
  }

  PushNotifications.addListener('registration', async (token) => {
    const { Capacitor } = await import('@capacitor/core');
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

    let wallet: string | null = null;
    try {
      wallet = localStorage.getItem('visby_wallet');
    } catch {
      // localStorage unavailable — fine, send null
    }

    await fetch('/api/native/register-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, token: token.value, platform }),
    }).catch(() => {});
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const link: string | undefined = (action.notification.data as Record<string, string>)?.link;
    if (link) navigate(link);
  });

  App.addListener('appUrlOpen', (event) => {
    const url = event.url;
    let path: string | null = null;

    if (url.startsWith('visby://')) {
      // visby://item/abc → /item/abc
      path = '/' + url.slice('visby://'.length);
    } else {
      try {
        const parsed = new URL(url);
        if (
          parsed.hostname === 'app.visby.me' ||
          parsed.hostname === 'visby.me'
        ) {
          path = parsed.pathname + parsed.search;
        }
      } catch {
        // malformed URL — ignore
      }
    }

    if (path) navigate(path);
  });
}

export async function capturePhoto(): Promise<string | null> {
  if (!isNative()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      quality: 85,
    });
    return photo.dataUrl ?? null;
  } catch {
    // user cancelled or permission denied
    return null;
  }
}
