const card = document.getElementById('card');
const header = document.getElementById('header');
const footer = document.getElementById('footer');
const labelEl = document.getElementById('label');
const timeEl = document.getElementById('time');
const contentEl = document.getElementById('content');

let flashTimer = null;
let lastHeight = 0;

function reportHeight() {
  const empty = !contentEl.innerHTML.trim();
  const height =
    header.offsetHeight +
    (empty ? 44 : contentEl.scrollHeight) +
    footer.offsetHeight +
    2; // Rahmen
  if (height !== lastHeight) {
    lastHeight = height;
    window.overlay.reportHeight(height);
  }
}

window.overlay.onUpdate((data) => {
  if (data.reset) {
    lastHeight = 0;
    card.classList.remove('pop');
    void card.offsetWidth; // Animation neu starten
    card.classList.add('pop');
  }
  if (data.state) card.dataset.state = data.state;
  if (typeof data.label === 'string') labelEl.textContent = data.label;
  if (typeof data.time === 'string') timeEl.textContent = data.time;
  if (typeof data.html === 'string') {
    contentEl.innerHTML = data.html;
    reportHeight();
  }
  if (data.flash) {
    const previous = labelEl.textContent;
    labelEl.textContent = data.flash;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (labelEl.textContent = previous), 900);
  }
});
