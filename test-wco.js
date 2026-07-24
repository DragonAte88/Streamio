const { app } = require('electron');
const wcoScraper = require('./electron/wcoScraper');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  wcoScraper.init();
  
  console.log("Testing search for 'Spongebob' with filter 'all'...");
  let res1 = await wcoScraper.search("Spongebob", "all");
  console.log("Results (all):", res1.length);
  
  console.log("Testing search for 'Naruto' with filter 'dub'...");
  let res2 = await wcoScraper.search("Naruto", "dub");
  console.log("Results (dub):", res2.length);
  const hasSub = res2.some(r => r.title.toLowerCase().includes('subbed'));
  console.log("Contains subbed?", hasSub);

  console.log("Testing search for 'Naruto' with filter 'sub'...");
  let res3 = await wcoScraper.search("Naruto", "sub");
  console.log("Results (sub):", res3.length);
  const hasDub = res3.some(r => r.title.toLowerCase().includes('dubbed'));
  console.log("Contains dubbed?", hasDub);

  console.log("Testing search for 'Batman' with filter 'cartoon'...");
  let res4 = await wcoScraper.search("Batman", "cartoon");
  console.log("Results (cartoon):", res4.length);
  
  if (res1.length > 0) {
    console.log("Fetching episodes for first spongebob result...");
    let eps = await wcoScraper.getEpisodes(res1[0].url);
    console.log(`Found ${eps.length} episodes. First episode:`, eps[0]);
  }

  app.quit();
});
