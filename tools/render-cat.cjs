// Original paired artwork, rasterized for both WebView and Android RemoteViews.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'app/src/main/assets/cat');
const native = path.join(root, 'app/src/main/res/drawable-nodpi');
const poses = ['idle', 'happy', 'eating', 'playing', 'sleeping', 'hungry', 'tired'];
const collars = { pink: '#ed9b9d', mint: '#91c6b0', gold: '#e9bf67' };

function cat(pose, silver, collar) {
  const fur = silver ? 'url(#silver-fur)' : '#121214';
  const body = silver ? '#f7f9fa' : '#121214';
  const outline = silver ? '#b6c0c7' : '#09090b';
  const detail = silver ? '#73818a' : '#c8bdad';
  const iris = silver ? '#a3cbb5' : '#eac576';
  const happy = pose === 'happy' || (pose === 'playing' && silver);
  const eyes = pose === 'sleeping' || happy
    ? `<path d="M-65 8q22 ${happy ? -27 : 20} 44 0M21 8q22 ${happy ? -27 : 20} 44 0" fill="none" stroke="${silver ? '#687c72' : '#dfc595'}" stroke-width="5.5" stroke-linecap="round"/>`
    : [-43, 43].map(x => `<ellipse cx="${x}" cy="5" rx="25" ry="29" fill="${iris}"/>
      <ellipse cx="${x + (silver ? -3 : 3)}" cy="7" rx="17" ry="24" fill="#171b1b"/>
      <ellipse cx="${x - 8}" cy="-7" rx="7" ry="8" fill="#ffffff"/><circle cx="${x + 10}" cy="19" r="3" fill="#ffffff"/>`).join('');
  const mouth = pose === 'hungry' ? `<ellipse cx="0" cy="49" rx="6" ry="7" fill="${detail}"/>`
    : pose === 'eating' ? '<path d="M-9 44q9 22 18 0Z" fill="#e2a5ad"/>'
    : `<path d="M0 38v7m0 0q-8 12-15 1m15-1q8 12 15 1" fill="none" stroke="${detail}" stroke-width="2.8" stroke-linecap="round"/>`;
  const resting = pose === 'sleeping' || pose === 'tired';
  const reach = resting ? [28, 32] : pose === 'playing' ? [75, 36] : [63, 14];
  const arm = silver ? `M-41 112q-28 26 -${reach[0]} ${reach[1]}` : `M41 112q28 26 ${reach[0]} ${reach[1]}`;
  return `<g>
    <path d="${silver ? 'M45 157q87 14 77-56-4-27-20-18' : 'M-44 157q-87 14-77-56 4-27 20-18'}" fill="none" stroke="${silver ? 'url(#silver-tail)' : '#121214'}" stroke-width="29" stroke-linecap="round"/>
    <ellipse cx="0" cy="117" rx="64" ry="71" fill="${body}" stroke="${outline}" stroke-width="2.5"/>
    <ellipse cx="-31" cy="174" rx="29" ry="21" fill="${body}" stroke="${outline}" stroke-width="2.5"/>
    <ellipse cx="31" cy="174" rx="29" ry="21" fill="${body}" stroke="${outline}" stroke-width="2.5"/>
    <path d="M-37 172v8m9-8v8m53-8v8m9-8v8" stroke="${silver ? '#c0c9cf' : '#323235'}" stroke-width="2" stroke-linecap="round"/>
    <path d="M-88-37q-15-40-10-81 3-14 17-4l52 49M29-73l52-49q14-10 17 4 5 41-10 81" fill="${silver ? '#c7cfd4' : '#121214'}" stroke="${outline}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-84-101q-2 26 7 45l28-16ZM84-101q2 26-7 45L49-72Z" fill="${silver ? '#e9c2c6' : '#584349'}"/>
    <path d="M0-78c-63 0-105 30-105 79 0 48 41 73 105 73S105 49 105 1C105-48 63-78 0-78Z" fill="${fur}" stroke="${outline}" stroke-width="3"/>
    ${silver ? '<path d="M-73-43q25-22 48-20M26-63q25-2 47 20" fill="none" stroke="#e2e7ea" stroke-width="7" stroke-linecap="round"/>' : '<path d="M-76-37q14-17 32-20" fill="none" stroke="#28282b" stroke-width="5" stroke-linecap="round"/>'}
    ${pose === 'tired' ? `<g transform="translate(0 8) scale(1 .62)">${eyes}</g>` : eyes}
    <ellipse cx="-71" cy="38" rx="14" ry="7" fill="#edb6bd" opacity="${silver ? '.65' : '.36'}"/>
    <ellipse cx="71" cy="38" rx="14" ry="7" fill="#edb6bd" opacity="${silver ? '.65' : '.36'}"/>
    <path d="M-7 32q7-4 14 0l-7 7Z" fill="#d8a0a7"/>${mouth}
    <path d="m-79 27-28-4m28 15-27 5m185-16 28-4m-28 15 27 5" fill="none" stroke="${silver ? '#adb9c1' : '#6d686c'}" stroke-width="2" stroke-linecap="round"/>
    <path d="M-40 72q40 14 80 0" fill="none" stroke="${collar}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="0" cy="86" r="10" fill="#f2d58c" stroke="#cba75e" stroke-width="1.8"/>
    <path d="M-4 86h8m-4 0v6" stroke="#ae8849" stroke-width="1.8" stroke-linecap="round"/>
    <path d="${arm}" fill="none" stroke="${outline}" stroke-width="30" stroke-linecap="round"/>
    <path d="${arm}" fill="none" stroke="${body}" stroke-width="25" stroke-linecap="round"/>
  </g>`;
}

function illustration(pose, collar, whiteCollar) {
  // Each state is one static composition, shared by the app and existing widgets.
  const cuddling = pose === 'sleeping' || pose === 'tired';
  const dining = pose === 'eating' || pose === 'hungry';
  const blackY = cuddling ? 252 : dining ? 253 : 237;
  const silverY = cuddling ? 252 : dining ? 253 : 245;
  const extra = pose === 'playing'
    ? '<circle cx="256" cy="409" r="30" fill="#e9a6ae" stroke="#c8818c" stroke-width="2.5"/><path d="M229 399q30 3 51 27M245 380q22 25 9 57M231 423q15-24 44-29" fill="none" stroke="#c8818c" stroke-width="2.5"/><path d="M277 429q31 22 45 1" fill="none" stroke="#c8818c" stroke-width="3" stroke-linecap="round"/>'
    : dining
      ? `<path d="M200 426h112l-8 21q-48 17-96 0Z" fill="#c6e0d5" stroke="#89b3a1" stroke-width="2.5"/><ellipse cx="256" cy="426" rx="56" ry="13" fill="#a3c9b7" stroke="#89b3a1" stroke-width="2.5"/>${pose === 'eating' ? '<g fill="#b38c69"><ellipse cx="228" cy="424" rx="15" ry="6"/><ellipse cx="280" cy="424" rx="15" ry="6"/></g>' : ''}<path d="M256 415v21" stroke="#89b3a1" stroke-width="2"/>`
      : cuddling ? '<g fill="none" stroke="#94b3a7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M403 122h17l-17 18h17M430 88h23l-23 24h23"/></g>' : '';
  const heart = pose === 'happy' ? '<path d="M260 131c-25-16-31-31-19-37 8-4 15 2 19 9 4-7 11-13 19-9 12 6 6 21-19 37Z" fill="#e6a4ae"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="silver-fur" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#bac3cb"/><stop offset=".36" stop-color="#edf1f3"/><stop offset=".7" stop-color="#ffffff"/></linearGradient>
      <linearGradient id="silver-tail" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#f8fafb"/><stop offset=".6" stop-color="#e0e6ea"/><stop offset="1" stop-color="#aab6c0"/></linearGradient>
    </defs>
    <ellipse cx="256" cy="456" rx="204" ry="15" fill="#67574f0e"/>
    <g transform="translate(165 ${blackY}) rotate(${cuddling ? 10 : pose === 'happy' ? 8 : 4})">${cat(pose, false, collar)}</g>
    <g transform="translate(347 ${silverY}) rotate(${cuddling ? -12 : pose === 'happy' ? -10 : -7})">${cat(pose, true, whiteCollar)}</g>
    ${extra}${heart}
  </svg>`.split('\n').map(line => line.trimEnd()).join('\n');
}

(async () => {
  fs.mkdirSync(web, { recursive: true }); fs.mkdirSync(native, { recursive: true });
  for (const [collar, color] of Object.entries(collars)) {
    for (const [whiteCollar, whiteColor] of Object.entries(collars)) {
      for (const pose of poses) {
        const name = `cat_${pose}_${collar}${whiteCollar === 'mint' ? '' : `_${whiteCollar}`}`;
        const svg = illustration(pose, color, whiteColor);
        fs.writeFileSync(path.join(web, `${name}.svg`), svg);
        await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(web, `${name}.png`));
        await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(path.join(native, `${name}.png`));
      }
    }
  }
  for (const [action, name] of Object.entries({ pet: 'hand-heart', feed: 'fish', play: 'volleyball', sleep: 'moon', wake: 'sun', settings: 'settings-2' })) {
    await sharp(path.join(root, 'app/src/main/assets/icons', `${name}.svg`)).resize(64, 64).png().toFile(path.join(native, `cat_icon_${action}.png`));
  }
  for (const [action, name] of Object.entries({ play: 'play', pause: 'pause', next: 'skip-forward', stop: 'square', music: 'music-2' })) {
    await sharp(path.join(root, 'app/src/main/assets/icons', `${name}.svg`)).resize(64, 64).png().toFile(path.join(native, `bgm_icon_${action}.png`));
  }
  console.log('Rendered 63 paired-cat scenes with independent collars and widget action icons.');
})().catch(error => { console.error(error); process.exitCode = 1; });
