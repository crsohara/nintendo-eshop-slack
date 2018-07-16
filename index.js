const SLACK_URL = process.env.SLACK_WEBHOOK;
const switchEshop = require('nintendo-switch-eshop');
const request = require('request');
const locale = 'FI';
const region = switchEshop.Region.EUROPE;
const argv = require('minimist')(process.argv.slice(2));

function getGamesByRegion(region) {
  switch (region) {
    case switchEshop.Region.AMERICAS:
      return switchEshop.getGamesAmerica();
      break;

    case switchEshop.Region.EUROPE:
      return switchEshop.getGamesEurope();
      break;

    case switchEshop.Region.ASIA:
      return switchEshop.getGamesJapan();
      break

    default:
      break;
  }
}

function getAllDiscountedGames(region) {
  return getGamesByRegion(region).then( games => {
    return games.filter( game => game.price_has_discount_b );
  });
}

function getMultipleGameInfo(title, region) {
  return getGamesByRegion(region).then( games => {
    return games.filter( game => game.title.toLocaleLowerCase().startsWith(title) );
  });
}

function getSingleGameInfo(title, region) {
  return getGamesByRegion(region).then( games => {
    return games.find( game => game.title.toLocaleLowerCase().startsWith(title) );
  });
}

function getPricesList(nsuidList) {
  return switchEshop.getPrices( locale, nsuidList )
    .then( priceResponse => priceResponse );
}

function formatSalePriceString(game, prices) {
  let discountPrice = game.price_sorting_f;
  let enddate = '';

  if (prices.discount_price) {
    let date = new Date(prices.discount_price.end_datetime);
    enddate = ` Ends ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    discountPrice = prices.discount_price.raw_value;
  } else if (game.price_has_discount_b) {

  }

  // console.log(`*${game.title}: €${discountPrice}* ${enddate}, normal price: €${prices.regular_price.raw_value}`);
  return `*${game.title}: €${discountPrice}* ${enddate}, normal price: €${prices.regular_price.raw_value}`;
}

function formatPriceString(gameList, priceList) {
  return gameList.map( game => {

    if (game.price_has_discount_b) {
      let price = priceList.find( price => parseInt(game.nsuid_txt[0]) === price.title_id )
      return formatSalePriceString(game, price);

    } else {
      // console.log(`*${game.title}*: normal price: *€${game.price_sorting_f}*`);
      return `*${game.title}*: normal price: *€${game.price_sorting_f}*`;
    }
  });
}

function formatGameListPrices(gameList) {
  gameList = Array.isArray(gameList) ? gameList : [gameList];

  let nsuid_txtList = gameList.map( game => game.nsuid_txt[0]);

  return getPricesList(nsuid_txtList)
    .then( priceList => {
      return formatPriceString(gameList, priceList.prices)
    }
  );
}

function getGamePriceByTitle(title) { // -l
  return getSingleGameInfo(title, region).then( game => {
    return formatGameListPrices(game);
  });
}

function getDiscountedGameList() { // no args
  return getAllDiscountedGames(region).then( gameList => {
    return formatGameListPrices(gameList);
  });
}

function getMultipleGamePriceByTitle(title) { // -s
  return getMultipleGameInfo(title, region).then( gameList => {
    return formatGameListPrices(gameList);
  });
}

function notifySlack(payload) {
  let options = {
    url: SLACK_URL,
    json: payload
  }
  request.post( options, notifySlackCallback );
}

function notifySlackCallback(error, response, body) {
  if (error) {
    console.log('notfiySlack error:')
    console.log(error)
    console.log(body)
    console.log(response)
  }
}

function init() {
  let thePromise;

  if (argv.s) { // title search - return multiple
    thePromise = getMultipleGamePriceByTitle(argv.s);

  } else if (argv.a) { // all
    thePromise = getDiscountedGameList();

  } else if (argv.l) { // list
    let list = argv.l.split(',');

    let payload = list.map( title => {
      return getGamePriceByTitle(title);
    });

    thePromise = Promise.all(payload);

  }

  thePromise.then( payload => {
    Promise.all(payload).then( string => {
      notifySlack( { text: string.join('\n') } );
    });
  });
}

init();
