/* @strip */
declare const Chart: {
  new (canvas: HTMLCanvasElement, config: unknown): unknown;
  defaults: { color: string; borderColor: string };
};
/* @strip */

document.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.color = '#8b949e';
  Chart.defaults.borderColor = '#30363d';

  document.querySelectorAll<HTMLCanvasElement>('[data-chart]').forEach(canvas => {
    const raw = canvas.getAttribute('data-chart');
    if (!raw) return;
    try {
      const config: unknown = JSON.parse(raw);
      new Chart(canvas, config);
    } catch (e) {
      console.error('Failed to initialize chart:', e);
    }
  });
});
