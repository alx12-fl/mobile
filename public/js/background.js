const canvas = document.getElementById('ambient');
if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  try {
    const { Kawarp } = await import('@kawarp/core');
    const effect = new Kawarp(canvas, {
      warpIntensity: 0.72,
      blurPasses: 9,
      animationSpeed: 0.55,
      saturation: 1.35,
      tintColor: [0.88, 0.39, 0.16],
      tintIntensity: 0.18,
      scale: 1.15
    });
    try {
      await effect.loadImage('https://alx12.dpdns.org/IMG_0106.webp');
    } catch {
      await effect.loadGradient(['#f3a16a', '#df7439', '#f7d5b5', '#f4c49e'], 35);
    }
    effect.start();
    window.addEventListener('pagehide', () => effect.dispose(), { once: true });
  } catch (error) {
    console.warn('Kawarp could not initialize; CSS ambient background remains active.', error);
  }
}
