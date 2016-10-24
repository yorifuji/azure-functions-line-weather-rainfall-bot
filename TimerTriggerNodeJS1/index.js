
var http = require("http");
var https = require("https");
var querystring = require("querystring");
var url = require("url");

function make_url(lon, lat)
{
    var yahoo_weather_api_url = "http://weather.olp.yahooapis.jp/v1/place?"
    var params = {
        "output"      : "json",
        "past"        : "1",
        "interval"    : "5",
        "coordinates" : lon + "," + lat,
        "appid"       : process.env.YAHOO_APP_ID
    };
    return yahoo_weather_api_url + querystring.stringify(params);
}


function get_yahoo_weather_data(lon, lat) {
    return new Promise((resolve, reject) => {
        http.get(make_url(lon, lat), res => {
            var body = '';
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => {
                resolve(JSON.parse(body));
            });
        }).on('error', e => {
            reject(new Error(e));
        });
    });
}

function parse_weather_data(data) {
    return data.Feature[0].Property.WeatherList.Weather;
}

// 0: nothing changed, 1: going to rainfall, 2: stop rainfall
function get_rainfall_status(w) {
    var w_o = w.filter(e => e["Type"] == "observation");
    var w_c = w.filter(e => e["Type"] == "forecast"   );
    var w_prev1 = w_o[w_o.length - 1];
    var w_prev2 = w_o[w_o.length - 2];
    return w_prev2["Rainfall"] == 0 && w_prev1["Rainfall"] ? 1 : 
        w_prev2["Rainfall"] && w_prev1["Rainfall"] == 0 ? 2 : 0;
}

function get_rainfall_last_result(data) {
    var w = data.filter(w => w["Type"] == "observation");
    return w[w.length - 1];
}

function make_readable_date(date)
{
    return parseInt(date.slice(8, 10)) + ":" + date.slice(10, 12);
}

function weather_data_to_message(data)
{
    if (get_rainfall_status(data) == 0) throw new Error("peacefull weather");

    var weather = get_rainfall_last_result(data);
    if (weather["Rainfall"]) {
        return [
            {
                "type" : "text",
                "text" : ["雨が降り始めました(" + weather["Rainfall"] + "mm/h)", "yjweather://Yahoo!天気を開く"].join("\n")
            }
        ];
    }
    else {
        return [
            {
                "type" : "text",
                "text" : "雨が止みました"
            }
        ];
    }
}

function push_line(messages)
{
    return new Promise((resolve,reject) => {
        var post_data = JSON.stringify({
            "to" : process.env.LINE_PUSH_TO,
            "messages" : messages
        });
        
        var parse_url = url.parse("https://api.line.me/v2/bot/message/push");
        var post_options = {
            host: parse_url.host,
            path: parse_url.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization' : 'Bearer {' + process.env.LINE_CHANNEL_ACCESS_TOKEN + '}',
                'Content-Length': Buffer.byteLength(post_data)
            }
        };
        
        var post_req = https.request(post_options, res => {
            var body = "";
            res.setEncoding('utf8');
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => {
                resolve(body);
            })
            res.on('error', err => {
                reject(new Error(err));
            })
        });
        
        post_req.write(post_data);
        post_req.end();
    });
}
                       
module.exports = function (context, myTimer) {
    var timeStamp = new Date().toISOString();
    
    if(myTimer.isPastDue)
    {
        context.log('Node.js is running late!');
    }
    context.log('Node.js timer trigger function ran!', timeStamp);   

    const lon = process.env.LONGITUDE;
    const lat = process.env.LATITUDE;

    get_yahoo_weather_data(lon, lat)
        .then(parse_weather_data)
        .then(weather_data_to_message)
        .then(push_line)
        .then(result => {
            context.log(result);
            context.done();
        }).catch(err => {
            context.log(err.message);
            context.done();
        });
};

if (require.main === module) {

    var lon = "139.753945";
    var lat = "35.683801";
    var context = {
        log : console.log,
        done: () => {}
    };
    get_yahoo_weather_data(lon, lat)
        .then(parse_weather_data)
//      .then(_test_rainfall)
//      .then(_test_clearsky)
        .then(weather_data_to_message)
        .then(push_line)
        .then(result => {
            context.log(result);
            context.done();
        }).catch(err => {
            context.log(err.message);
            context.done();
        });

    context.log(0 == get_rainfall_status(make_dummy_rainfall_data(0, 0)));
    context.log(1 == get_rainfall_status(make_dummy_rainfall_data(0, 1)));
    context.log(2 == get_rainfall_status(make_dummy_rainfall_data(1, 0)));
    context.log(0 == get_rainfall_status(make_dummy_rainfall_data(1, 2)));
    context.log(0 == get_rainfall_status(make_dummy_rainfall_data(2, 1)));

}

function _test_rainfall(data)
{
    return Promise.resolve(make_dummy_rainfall_data(0, 1.23));
}

function _test_clearsky(data)
{
    return Promise.resolve(make_dummy_rainfall_data(1, 0));
}

function make_dummy_rainfall_data(a, b)
{
    return [
        { Type: 'observation', Date: '201610090040', Rainfall: 0 },
        { Type: 'observation', Date: '201610090045', Rainfall: 0 },
        { Type: 'observation', Date: '201610090050', Rainfall: 0 },
        { Type: 'observation', Date: '201610090055', Rainfall: a },
        { Type: 'observation', Date: '201610090100', Rainfall: b },
        { Type: 'forecast', Date: '201610090105', Rainfall: 0 },
        { Type: 'forecast', Date: '201610090110', Rainfall: 0 },
        { Type: 'forecast', Date: '201610090115', Rainfall: 0 },
        { Type: 'forecast', Date: '201610090120', Rainfall: 0 },
        { Type: 'forecast', Date: '201610090125', Rainfall: 0 }
    ]
}
