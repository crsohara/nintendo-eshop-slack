const url = require('url');
const switchEshop = require('nintendo-switch-eshop');
const request = require('request');
const locale = 'FI';
const region = switchEshop.Region.EUROPE;

module.exports = function(unit) {
  const SLACK_URL = unit.config.SLACK_WEBHOOK;
  const GAMELIST = unit.config.GAMELIST;
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
        break;

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
      let x = games.find( game => game.title.toLocaleLowerCase().startsWith(title) );
      return x;
    });
  }

  function getPricesList(nsuidList) {
    return switchEshop.getPrices( locale, nsuidList )
      .then( priceResponse => priceResponse );
  }

  function formatSalePriceString(game, prices) {
    let discountPrice = game.price_sorting_f;
    let enddate = '';

    if (prices.prices !== undefined) {
      prices.regular_price = prices.prices[0].regular_price;
      prices.regular_price = prices.prices[0].discount_price;
    }

    if (prices.discount_price) {
      let date = new Date(prices.discount_price.end_datetime);
      enddate = ` Ends ${date.getDate()}/${date.getMonth()}/${date.getFullYear()}`;
      discountPrice = prices.discount_price.raw_value;
    }

    return `*${game.title}: €${discountPrice}* until ${enddate}, normal price: €${prices.regular_price.raw_value}`;
  }

  function formatPriceString(gameList, priceList) {

    if (priceList === null) {
      return `*${gameList.title}*: normal price: *€${gameList.price_sorting_f}*`;

    } else {

      return gameList.map( game => {
        let price;
        if (!Array.isArray(priceList)) {
          price = priceList;
        } else {
          price = priceList.find( price => parseInt(game.nsuid_txt[0]) === price.title_id );
        }

        if (game.price_has_discount_b) {
          return formatSalePriceString(game, price);
        } else {
          if (price.prices !== undefined) {
            return `*${game.title}*: normal price: *€${price.prices[0].regular_price.raw_value}*`;
          } else {
            return `*${game.title}*: normal price: *€${price.regular_price.raw_value}*`;
          }
        }
      });
    }
  }

  function formatGameListPrices(gameList) {
    if (!Array.isArray(gameList)) {
      return getPricesList(gameList.nsuid_txt[0]).then(priceInfo => {
        return formatPriceString([gameList], priceInfo)
      });
    }

    let nsuid_txtList = gameList.map( game => game.nsuid_txt[0]);

    return getPricesList(nsuid_txtList)
      .then( priceList => {
        return formatPriceString(gameList, priceList.prices)
      }
    );
  }

  function getGamePriceByTitle(title) { // -t
    return getSingleGameInfo(title, region).then( game => {
      return formatGameListPrices(game);
    });
  }

  function getDiscountedGameList() { // no args
    return getAllDiscountedGames(region).then( gameList => {
      return formatGameListPrices(gameList);
    }).catch( error => console.log(error));
  }

  function getMultipleGamePriceByTitle(title) { // -s
    return getMultipleGameInfo(title, region).then( gameList => {
      return formatGameListPrices(gameList);
    }).catch( error => console.log(error));
  }

  function notifySlack(payload) {
    let options = {
      url: SLACK_URL,
      json: payload
    }
    options.json.text = "-- *eSHOP CURRENT DEALS* --\n" + options.json.text;
    request.post( options, notifySlackCallback );
    unit.done(null, payload);
  }

  function notifySlackCallback(error, response, body) {
    if (error) {
      console.log('notfiySlack error:')
      console.log(error)
      console.log(body)
      console.log(response)
    }
  }

  function init(query) {
    if (query.type === 's') { // title search - return multiple
      getMultipleGamePriceByTitle(query.title).then( payload => {
        Promise.all(payload).then( string => {
          notifySlack( { text: string.join('\n') } );
        });
      });

    } else if (query.type === 't') { // title search
      getGamePriceByTitle(query.title).then( payload => {
        notifySlack( { text: payload } );
      });

    } else if (query.type === 'a') { // all
      getDiscountedGameList().then( payload => {
        Promise.all(payload).then( string => {
          notifySlack( { text: string.join('\n') } );
        }).catch( error => console.log(error));
      });

    } else if (query.type === 'l') { // list
      let list = query.title.split(',');
      let payload = list.map( title => {
        return getGamePriceByTitle(title);
      });

      Promise.all(payload).then( string => {
        notifySlack( { text: string.join('\n') } );
      }).catch( error => console.log(error));
    } else if (query.type === 'onsale') { // all
      let list = query.title.split(',');
      let payload = list.map( title => {
        return getGamePriceByTitle(title);
      });

      Promise.all(payload).then( string => {
        notifySlack( { text: string.join('\n') } );
      }).catch( error => console.log(error));

    } else {
      let list = GAMELIST.split(',');
      let payload = list.map( title => {
        return getGamePriceByTitle(title);
      });

      Promise.all(payload).then( string => {
        let joinedstring = string.join('\n');
        if (joinedstring.indexOf('until') !== -1) {
          notifySlack( { text: joinedstring } );
        } else {
           unit.done(null, joinedstring);
        }
      }).catch( error => console.log(error));
    }
  }
  init(unit.req.uri.query);
}