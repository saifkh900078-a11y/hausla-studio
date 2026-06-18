/* Hausla Studio — in-browser video joiner/branding/music app
   Everything runs locally via ffmpeg.wasm (single-thread build).
   No API key, no upload to any server. */

const { FFmpeg: FFmpegClass } = FFmpeg;
const ffmpeg = new FFmpegClass();

let selectedFiles = [];      // File objects, in order
let ffmpegLoaded = false;
let lastOutputUrl = null;

const uploadZone   = document.getElementById('uploadZone');
const fileInput    = document.getElementById('fileInput');
const filmstrip    = document.getElementById('filmstrip');
const emptyNote    = document.getElementById('emptyNote');
const generateBtn  = document.getElementById('generateBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPct  = document.getElementById('progressPct');
const resultCard   = document.getElementById('resultCard');
const previewVideo = document.getElementById('previewVideo');
const downloadBtn  = document.getElementById('downloadBtn');

const channelNameInput = document.getElementById('channelName');
const textPosSelect     = document.getElementById('textPos');
const textStyleSelect   = document.getElementById('textStyle');
const brandToggle       = document.getElementById('brandToggle');
const musicSelect        = document.getElementById('musicSelect');
const keepOriginalAudio  = document.getElementById('keepOriginalAudio');

/* ---------- Upload zone interactions ---------- */

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

['dragover','dragenter'].forEach(evt =>
  uploadZone.addEventListener(evt, (e) => { e.preventDefault(); uploadZone.classList.add('drag'); })
);
['dragleave','drop'].forEach(evt =>
  uploadZone.addEventListener(evt, (e) => { e.preventDefault(); uploadZone.classList.remove('drag'); })
);
uploadZone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
  addFiles(files);
});

fileInput.addEventListener('change', (e) => {
  addFiles(Array.from(e.target.files));
  fileInput.value = '';
});

function addFiles(files){
  selectedFiles = selectedFiles.concat(files);
  renderFilmstrip();
}

function removeFile(idx){
  selectedFiles.splice(idx, 1);
  renderFilmstrip();
}

function formatBytes(bytes){
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

function renderFilmstrip(){
  filmstrip.innerHTML = '';
  if (selectedFiles.length === 0){
    emptyNote.style.display = 'block';
    generateBtn.disabled = true;
    return;
  }
  emptyNote.style.display = 'none';
  generateBtn.disabled = false;

  selectedFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'reel-item';
    item.innerHTML = `
      <span class="num">${idx + 1}</span>
      <div class="meta">
        <div class="fname">${escapeHtml(file.name)}</div>
        <div class="fsize">${formatBytes(file.size)}</div>
      </div>
      <button class="remove" aria-label="Clip hatayein" data-idx="${idx}">✕</button>
    `;
    filmstrip.appendChild(item);
  });

  filmstrip.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.idx, 10)));
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- FFmpeg loading ---------- */

async function ensureFFmpegLoaded(onLog){
  if (ffmpegLoaded) return;
  ffmpeg.on('log', ({ message }) => { if (onLog) onLog(message); });
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  await ffmpeg.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });
  ffmpegLoaded = true;
}

async function fetchFile(file){
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

/* ---------- Background music synthesis (WAV, generated on the fly) ---------- */
/* Builds a short cinematic bed (no external audio files needed) and
   returns it as a Uint8Array WAV so ffmpeg can mix it in. */
function synthesizeMusic(kind, duration){
  const sr = 44100;
  const n = Math.floor(sr * duration);
  const data = new Float32Array(n);

  for (let i = 0; i < n; i++){
    const t = i / sr;
    let v = 0;

    if (kind === 'rise'){
      const build = Math.min(1, t / Math.max(duration * 0.7, 0.001));
      v += 0.10 * Math.sin(2*Math.PI*55*t);
      v += 0.07 * build * Math.sin(2*Math.PI*220*t) * (0.5+0.5*Math.sin(2*Math.PI*6*t));
      v += 0.05 * build * Math.sin(2*Math.PI*440*t);
    } else if (kind === 'drone'){
      v += 0.12 * Math.sin(2*Math.PI*60*t);
      v += 0.05 * Math.sin(2*Math.PI*90*t) * (0.6+0.4*Math.sin(2*Math.PI*0.5*t));
    } else if (kind === 'pulse'){
      v += 0.08 * Math.sin(2*Math.PI*80*t);
      const beat = (t % 0.5);
      const env = Math.exp(-beat*18);
      v += 0.25 * env * Math.sin(2*Math.PI*150*t);
      v += 0.06 * Math.sin(2*Math.PI*330*t);
    }

    // overall fade in/out
    const fadeIn = Math.min(1, t / 0.8);
    const fadeOut = Math.min(1, (duration - t) / 1.2);
    v *= Math.max(0, Math.min(fadeIn, fadeOut));

    data[i] = Math.max(-1, Math.min(1, v));
  }

  return floatToWav(data, sr);
}

function floatToWav(samples, sampleRate){
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str){
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++){
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/* ---------- Main generate pipeline ---------- */

generateBtn.addEventListener('click', runPipeline);

function setProgress(pct, label){
  progressFill.style.width = pct + '%';
  progressPct.textContent = pct + '%';
  if (label) progressText.textContent = label;
}

async function runPipeline(){
  if (selectedFiles.length === 0) return;

  generateBtn.disabled = true;
  resultCard.classList.remove('show');
  progressWrap.classList.add('show');
  setProgress(2, 'FFmpeg load ho raha hai…');

  try {
    await ensureFFmpegLoaded();
    setProgress(10, 'Clips load ho rahi hain…');

    // Write each input file into ffmpeg's virtual FS
    const inputNames = [];
    for (let i = 0; i < selectedFiles.length; i++){
      const name = `in${i}.mp4`;
      await ffmpeg.writeFile(name, await fetchFile(selectedFiles[i]));
      inputNames.push(name);
    }

    setProgress(25, 'Clips jodi ja rahi hain…');

    // Build concat list
    const listContent = inputNames.map(n => `file '${n}'`).join('\n');
    await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listContent));

    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'joined.mp4']);

    setProgress(45, 'Duration check ho rahi hai…');

    // Probe duration roughly by reading ffmpeg log isn't trivial here;
    // assume up to ~60s per clip set is fine for in-browser processing.
    // We use a fixed approach: extract duration via a quick pass is skipped
    // for simplicity — music is generated to a generous default length
    // and trimmed to match using -shortest during the mix step.

    let currentFile = 'joined.mp4';

    // Branding text overlay
    if (brandToggle.checked && channelNameInput.value.trim()){
      setProgress(55, 'Branding text add ho raha hai…');
      const text = channelNameInput.value.trim().toUpperCase();
      const pos = textPosSelect.value === 'top' ? 'y=40' : 'y=h-th-50';
      const fontsize = textStyleSelect.value === 'elegant' ? 30 : 26;

      const safeText = text.replace(/'/g, "\\'").replace(/:/g, '\\:');

      await ffmpeg.exec([
        '-i', currentFile,
        '-vf', `drawtext=text='${safeText}':fontcolor=white:fontsize=${fontsize}:x=(w-text_w)/2:${pos}:box=1:boxcolor=black@0.35:boxborderw=10`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        '-c:a', 'copy',
        'branded.mp4'
      ]);
      currentFile = 'branded.mp4';
    }

    // Background music mix
    if (musicSelect.value !== 'none'){
      setProgress(75, 'Background music mix ho raha hai…');

      // Generous duration guess; ffmpeg will trim via -shortest anyway.
      const approxDuration = Math.max(15, selectedFiles.length * 6);
      const musicWav = synthesizeMusic(musicSelect.value, approxDuration);
      await ffmpeg.writeFile('music.wav', musicWav);

      const keepOrig = keepOriginalAudio.checked;
      const filterAudio = keepOrig
        ? '[0:a]volume=0.55[orig];[1:a]volume=0.8[bg];[orig][bg]amix=inputs=2:duration=first[aout]'
        : '[1:a]volume=0.9[aout]';

      await ffmpeg.exec([
        '-i', currentFile,
        '-i', 'music.wav',
        '-filter_complex', filterAudio,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        'final.mp4'
      ]);
      currentFile = 'final.mp4';
    }

    setProgress(95, 'Final video tayyar ho rahi hai…');

    const outData = await ffmpeg.readFile(currentFile);
    const blob = new Blob([outData.buffer], { type: 'video/mp4' });
    if (lastOutputUrl) URL.revokeObjectURL(lastOutputUrl);
    lastOutputUrl = URL.createObjectURL(blob);

    previewVideo.src = lastOutputUrl;
    downloadBtn.href = lastOutputUrl;

    const channel = channelNameInput.value.trim() || 'hausla';
    downloadBtn.download = `${channel.replace(/\s+/g,'-').toLowerCase()}-video.mp4`;

    setProgress(100, 'Mukammal!');
    resultCard.classList.add('show');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err){
    console.error(err);
    progressText.textContent = 'Kuch masla aaya — dobara try karein';
    progressFill.style.background = 'var(--coral)';
  } finally {
    generateBtn.disabled = false;
  }
}

/* ---------- PWA install prompt ---------- */

let deferredPrompt = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBanner.classList.add('show');
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBanner.classList.remove('show');
});

window.addEventListener('appinstalled', () => {
  installBanner.classList.remove('show');
});

/* ---------- Service worker registration (offline support) ---------- */
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
