const fs = require('fs');

const puppeteer = require('puppeteer');
const ProgressBar = require('progress');

const EXPORT_FILE_LOCATION = './marriott.csv';
const TEST = process.env.TEST === '1';

function arrayToCSV(data) {
  let csvContents = `${Object.keys(data[0]).join(',')}`;
  for (const datum of data) {
    csvContents += `\n${Object.values(datum).join(',')}`;
  }
  return csvContents;
}

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://www.marriott.com/hotel-search.mi');

  let regionLinks = [];

  const regionToggles = await page.$$('.js-region-toggle');
  for (const regionToggle of regionToggles) {
    await regionToggle.click();
    const links = await regionToggle.$$eval('.m-state-list a', as =>
      as.map(a => a.getAttribute('href'))
    );

    regionLinks.push(...links);
  }

  console.log(`${regionLinks.length} found`);

  if (TEST) {
    console.log('Limiting to one for testing purposes');
    regionLinks = regionLinks.slice(0, 1);
  }

  const progressBar = new ProgressBar(
    ':bar :current/:total :percent :elapseds/:etas',
    { total: regionLinks.length }
  );

  let scraped = [];
  for (let n in regionLinks) {
    const link = regionLinks[n];
    await page.goto(`https://www.marriott.com${link}`);

    // Limiting to 100 pages to prevent infinite loops
    for (let i = 0; i < 100; i++) {
      // console.log(`Page ${i}`);
      let destinationName;
      try {
        destinationName = await page.$eval(
          '#destination a',
          el => el.innerText
        );
        // eslint-disable-next-line no-empty
      } catch (err) {}

      // if (!destinationName) {
      //   console.log('No destination name found');
      // } else {
      //   console.log(destinationName);
      // }

      const locations = await page.$$eval(
        '.js-property-list-container > div',
        divs =>
          divs.map(div => ({
            locationName: div.querySelector('.l-property-name').innerText,
            country: div.querySelector('.m-hotel-address').dataset.country,
            addressLine1: div.querySelector('.m-hotel-address').dataset
              .addressLine1,
            postalCode: div.querySelector('.m-hotel-address').dataset
              .postalCode,
            city: div.querySelector('.m-hotel-address').dataset.city,
            state: div.querySelector('.m-hotel-address').dataset.state,
            countryDescription: div.querySelector('.m-hotel-address').dataset
              .countryDescription,
            contact: div.querySelector('.m-hotel-address').dataset.contact
          }))
      );

      scraped.push(
        ...locations.map(l => ({
          ...l,
          destinationName
        }))
      );

      let nextPageHref;
      try {
        nextPageHref = await page.$eval('.m-pagination-next', el =>
          el.getAttribute('href')
        );
        // eslint-disable-next-line no-empty
      } catch (err) {}

      if (!nextPageHref) {
        // console.log('No more pages, going to next location');
        break;
      }

      await page.goto(`https://www.marriott.com${nextPageHref}`);
    }

    progressBar.tick();
  }

  await browser.close();

  fs.writeFileSync(EXPORT_FILE_LOCATION, arrayToCSV(scraped));
})();

process.on('unhandledRejection', err => {
  throw err;
});
