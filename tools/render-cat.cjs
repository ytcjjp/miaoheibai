// Original vector artwork, rasterized for both WebView and Android RemoteViews.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'app/src/main/assets/cat');
const native = path.join(root, 'app/src/main/res/drawable-nodpi');
const poses = ['idle', 'happy', 'eating', 'playing', 'sleeping', 'hungry', 'tired'];
const collars = { pink: '#ed9b9d', mint: '#91c6b0', gold: '#e9bf67' };

function illustration(pose, collar) {
  const sleepy = pose === 'sleeping' || pose === 'tired';
  const smiling = pose === 'happy' || pose === 'playing';
  const eyes = sleepy || smiling
    ? `<path d="M169 225q28 ${smiling ? -35 : 24} 57 0M279 225q28 ${smiling ? -35 : 24} 57 0" fill="none" stroke="#efc972" stroke-width="10" stroke-linecap="round"/>`
    : `<ellipse cx="198" cy="219" rx="35" ry="40" fill="#efc66d"/><ellipse cx="307" cy="219" rx="35" ry="40" fill="#efc66d"/>
       <ellipse cx="203" cy="219" rx="17" ry="29" fill="#12151b"/><ellipse cx="302" cy="219" rx="17" ry="29" fill="#12151b"/>
       <circle cx="191" cy="204" r="9" fill="#fffdf5"/><circle cx="290" cy="204" r="9" fill="#fffdf5"/><circle cx="212" cy="233" r="4" fill="#fffdf5"/><circle cx="311" cy="233" r="4" fill="#fffdf5"/>`;
  const mouth = pose === 'hungry'
    ? '<path d="M241 280q15-14 30 0" fill="none" stroke="#a59baa" stroke-width="4" stroke-linecap="round"/>'
    : pose === 'eating'
    ? '<path d="M241 270q15 26 30 0" fill="#d98e9a" stroke="#12151b" stroke-width="5" stroke-linejoin="round"/>'
    : '<path d="M256 263v11m0 0q-10 14-21 1m21-1q10 14 21 1" fill="none" stroke="#a59baa" stroke-width="4" stroke-linecap="round"/>';
  const extra = pose === 'sleeping'
    ? '<g fill="none" stroke="#99b6ad" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M373 151h22l-22 23h22M410 100h30l-30 30h30"/></g>'
    : pose === 'playing'
      ? '<circle cx="119" cy="421" r="34" fill="#f2b5ad" stroke="#d88b84" stroke-width="4"/><path d="M89 410q33 4 59 26M100 394q36 21 24 60M88 428q21-24 48-33" fill="none" stroke="#d88b84" stroke-width="3"/>'
      : pose === 'eating'
        ? '<ellipse cx="257" cy="438" rx="66" ry="15" fill="#a2c9ba"/><path d="M193 437q5 39 64 39t64-39" fill="#c9e1d5" stroke="#7ea596" stroke-width="4"/><g fill="#bd9270"><circle cx="233" cy="436" r="8"/><circle cx="252" cy="432" r="8"/><circle cx="272" cy="435" r="8"/><circle cx="289" cy="438" r="7"/></g>'
        : pose === 'happy'
          ? '<path d="M398 147c-29-17-37-39-22-46 11-5 19 4 22 10 4-7 13-15 23-9 15 10 2 31-23 45Z" fill="#e9a0a4"/>' : '';
  const paw = pose === 'playing'
    ? '<path d="M181 343q-62 7-63-32c-1-27 36-35 47-9l31 30" fill="#30323e" stroke="#191b24" stroke-width="6"/><ellipse cx="139" cy="310" rx="12" ry="14" fill="#a97b87"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <ellipse cx="270" cy="470" rx="134" ry="15" fill="#614e4712"/>
  <path d="M331 426q115 23 103-74-9-47-41-21" fill="none" stroke="#1a1c25" stroke-width="39" stroke-linecap="round"/>
  <path d="M350 430q85 1 72-68" fill="none" stroke="#363947" stroke-width="11" stroke-linecap="round"/>
  <ellipse cx="257" cy="366" rx="94" ry="100" fill="#262832" stroke="#191b24" stroke-width="6"/>
  <ellipse cx="256" cy="383" rx="64" ry="66" fill="#30333f"/>
  <ellipse cx="211" cy="440" rx="34" ry="29" fill="#30333f" stroke="#191b24" stroke-width="6"/>
  <ellipse cx="303" cy="440" rx="34" ry="29" fill="#30333f" stroke="#191b24" stroke-width="6"/>
  <path d="M206 437v13m12-13v13m78-13v13m12-13v13" stroke="#595563" stroke-width="3" stroke-linecap="round"/>
  <path d="M136 173 126 65q32-9 91 61M301 125q55-62 88-60l-9 109" fill="#272934" stroke="#191b24" stroke-width="7" stroke-linejoin="round"/>
  <path d="m143 89 10 67 43-20Z M370 89l-11 67-42-20Z" fill="#a07b89"/>
  <path d="M130 165q-23 33-22 72-10 5-16 18l22 4q13 66 142 68 128-2 141-68l22-4q-6-13-16-18 1-39-22-72-34-50-125-50t-126 50Z" fill="#262832" stroke="#191b24" stroke-width="7" stroke-linejoin="round"/>
  <path d="M153 169q30-38 74-34" fill="none" stroke="#3d404d" stroke-width="10" stroke-linecap="round"/>
  <path d="m241 124 15 20 15-20" fill="none" stroke="#41424e" stroke-width="5" stroke-linejoin="round"/>
  ${eyes}
  <ellipse cx="160" cy="263" rx="19" ry="10" fill="#d698a1" opacity=".55"/>
  <ellipse cx="350" cy="263" rx="19" ry="10" fill="#d698a1" opacity=".55"/>
  <path d="M246 254q10-5 20 0l-10 10Z" fill="#d5a1a9"/>
  ${mouth}
  <path d="m132 254-34-7m34 20-35 4m281-17 34-7m-34 20 35 4" stroke="#797681" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M191 319q65 20 130 0" fill="none" stroke="${collar}" stroke-width="14" stroke-linecap="round"/>
  <circle cx="257" cy="337" r="16" fill="#f1d17e" stroke="#cda04c" stroke-width="3"/>
  <path d="M251 338h12m-6 0v10" stroke="#a77b36" stroke-width="3" stroke-linecap="round"/>
  ${paw}${extra}
  </svg>`;
}

(async () => {
  fs.mkdirSync(web, { recursive: true }); fs.mkdirSync(native, { recursive: true });
  for (const [collar, color] of Object.entries(collars)) {
    for (const pose of poses) {
      const svg = illustration(pose, color);
      fs.writeFileSync(path.join(web, `cat_${pose}_${collar}.svg`), svg);
      const png = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
      fs.writeFileSync(path.join(web, `cat_${pose}_${collar}.png`), png);
      await sharp(Buffer.from(svg)).resize(1024, 1024).png()
        .toFile(path.join(native, `cat_${pose}_${collar}.png`));
    }
  }
  for (const [action, name] of Object.entries({ pet: 'hand-heart', feed: 'fish', play: 'volleyball', sleep: 'moon', wake: 'sun', settings: 'settings-2' })) {
    await sharp(path.join(root, 'app/src/main/assets/icons', `${name}.svg`)).resize(64, 64).png()
      .toFile(path.join(native, `cat_icon_${action}.png`));
  }
  for (const [action, name] of Object.entries({ play: 'play', pause: 'pause', next: 'skip-forward', stop: 'square', music: 'music-2' })) {
    await sharp(path.join(root, 'app/src/main/assets/icons', `${name}.svg`)).resize(64, 64).png()
      .toFile(path.join(native, `bgm_icon_${action}.png`));
  }
  console.log('Rendered 21 original cat poses and widget action icons.');
})().catch(error => { console.error(error); process.exitCode = 1; });
