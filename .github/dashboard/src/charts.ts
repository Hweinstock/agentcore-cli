declare const Chart: {
  new (canvas: HTMLCanvasElement, config: unknown): unknown;
  defaults: { color: string; borderColor: string };
};

document.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.color = '#8b949e';
  Chart.defaults.borderColor = '#30363d';

  document.querySelectorAll<HTMLCanvasElement>('[data-chart]').forEach(canvas => {
    const raw = canvas.getAttribute('data-chart');
    if (!raw) return;
    const config: unknown = JSON.parse(raw);
    new Chart(canvas, config);
  });

  document.querySelectorAll<HTMLElement>('.tabs').forEach(container => {
    container.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = container.closest('.card')?.querySelectorAll<HTMLElement>('.tab-panel');
        panel?.forEach(p => (p.style.display = 'none'));
        const idx = btn.dataset.idx;
        if (idx != null) {
          const target = container.closest('.card')?.querySelector<HTMLElement>(`[data-panel="${idx}"]`);
          if (target) target.style.display = '';
        }
      });
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      if (!card) return;
      const table = card.querySelector('table');
      let text: string;
      if (table) {
        text = Array.from(table.querySelectorAll('tr'))
          .map(r =>
            Array.from(r.querySelectorAll('th,td'))
              .map(c => c.textContent?.trim() ?? '')
              .join(' | ')
          )
          .join('\n');
      } else {
        text = (card.textContent ?? '').replace(/📋/g, '').trim();
      }
      void navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓';
        btn.classList.add('copied');
        globalThis.setTimeout(() => {
          btn.textContent = '📋';
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  });
});
