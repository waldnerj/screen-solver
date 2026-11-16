const card = document.getElementById('card');
const header = document.getElementById('header');
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
  if (typeof data.opacity === 'number') card.style.setProperty('--alpha', data.opacity);
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

// Markieren genügt: Die Auswahl wird beim Loslassen der Maus kopiert.
// (Das Overlay bekommt nie den Tastaturfokus, ⌘C würde hier nicht ankommen.)
document.addEventListener('mouseup', () => {
  const text = String(window.getSelection()).trim();
  if (text) window.overlay.copy(text);
});
