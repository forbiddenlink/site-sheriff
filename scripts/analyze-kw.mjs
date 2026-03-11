import https from 'https';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function analyze(html, word, url) {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  h = h.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // Extract title + h1-h3 text
  const headings = [];
  for (const m of h.matchAll(/<(title|h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)) {
    headings.push(m[2].replace(/<[^>]+>/g, ' ').toLowerCase());
  }
  const headingText = headings.join(' ');
  const wordInHeadings = (headingText.match(new RegExp('\\b' + word + '\\b', 'gi')) || []).length;

  // All visible text
  const vis = h.replace(/<[^>]+>/g, ' ');
  const allWords = vis.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, '')).filter(w => w.length > 2);
  const occ = allWords.filter(w => w === word).length;
  const totalAllWords = allWords.length;
  
  console.log('URL:', url);
  console.log('  Word:', word);
  console.log('  Occurrences in visible text:', occ, '/', totalAllWords, '=', (occ/totalAllWords*100).toFixed(1) + '%');
  console.log('  Occurrences in headings/title:', wordInHeadings);
  console.log('  Heading text sample:', headingText.substring(0, 200));
  console.log();
}

const h1 = await fetch('https://stripe.com/authorization-boost');
analyze(h1, 'treatment', 'authorization-boost');

const h2 = await fetch('https://stripe.com/contact/sales');
analyze(h2, 'started', 'contact/sales');
