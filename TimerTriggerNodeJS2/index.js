
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
            reject(e);
        });
    });
}

function get_rainfall_data(data) {
    return data.Feature[0].Property.WeatherList.Weather;
}

function get_rainfall_last_result(data) {
    var w = data.filter(w => w["Type"] == "observation");
    return w[w.length - 1];
}

function make_readable_date(date)
{
    return parseInt(date.slice(8, 10)) + ":" + date.slice(10, 12);
}

function make_line_rainfall_forecast_message(weather)
{
    return weather["Rainfall"] ? [
        {
            "type" : "text",
            "text" : [make_readable_date(weather.Date) + " 雨が降りそうです(" + weather["Rainfall"] + "mm/h)", "yjweather://Yahoo!天気を開く"].join("\n")
        }
    ] : [
        {
            "type" : "text",
            "text" : [make_readable_date(weather.Date) + " 雨が止みそうです", "yjweather://Yahoo!天気を開く"].join("\n")
        }
    ];
}

function push_line(to, messages)
{
    return new Promise((resolve,reject) => {
        var post_data = JSON.stringify({
            "to" : to,
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
                reject(err);
            })
        });
        
        post_req.write(post_data);
        post_req.end();
    });
}

function is_rainfall_now(data)
{
    var observation = data.filter(w => w["Type"] == "observation" );
    return observation[observation.length - 1]["Rainfall"] != 0 ? true : false;
}

function will_start_rainfall(data)
{
    var forecast = data.filter(w => w["Type"] == "forecast" );
    for (var i = 1; i < 7; i++) {
        if (forecast[i]["Rainfall"]) return forecast[i];
    }
    return null;
}

function will_stop_rainfall(data)
{
    var forecast = data.filter(w => w["Type"] == "forecast" );
    var rain_stop = null;
    for (var i = 6; i > 0; i--) {
        if (forecast[i]["Rainfall"] == 0) rain_stop = forecast[i];
    }
    return rain_stop;
}

module.exports = function (context, myTimer) {
    var timeStamp = new Date().toISOString();
    
    if(myTimer.isPastDue)
    {
        context.log('Node.js is running late!');
    }
    context.log('Node.js timer trigger function ran!', timeStamp);   

    var lon = process.env.LONGITUDE;
    var lat = process.env.LATITUDE;

    get_yahoo_weather_data(lon, lat).then(data => {
        return get_rainfall_data(data);
    }).then(data => {
        return is_rainfall_now(data) ? will_stop_rainfall(data) : will_start_rainfall(data);
    }).then(data => {
        return data ? make_line_rainfall_forecast_message(data) : null
    }).then(messages => {
        return (messages && messages.length) ? push_line(process.env.LINE_PUSH_TO, messages) : null;
    }).then(result => {
        context.log(result);
        context.done();
    }).catch(err => {
        context.log(err);
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
    
    get_yahoo_weather_data(lon, lat).then(data => {
        return get_rainfall_data(data);
    }).then(data => {
//      data = make_dummy_rainfall_data(0, 1);
//      data = make_dummy_rainfall_data(1, 0);
        if (is_rainfall_now(data)) {
            return will_stop_rainfall(data);
        }
        else {
            return will_start_rainfall(data);
        }
    }).then(data => {
        return data ? make_line_rainfall_forecast_message(data) : null
    }).then(messages => {
        return (messages && messages.length) ? push_line(process.env.LINE_PUSH_TO, messages) : null;
    }).then(result => {
        context.log(result);
        context.done();
    }).catch(err => {
        context.log(err);
        context.done();
    });

    context.log(is_rainfall_now(make_dummy_rainfall_data(0, 0)) == false);
    context.log(is_rainfall_now(make_dummy_rainfall_data(1, 0)) == true);

    context.log(will_start_rainfall(make_dummy_rainfall_data(0, 0)) == null);
    context.log(will_start_rainfall(make_dummy_rainfall_data(0, 1)) != null);
    
    context.log(will_stop_rainfall(make_dummy_rainfall_data(1, 1)) == null);
    context.log(will_stop_rainfall(make_dummy_rainfall_data(1, 0)) != null);

    var rain_fall = will_start_rainfall(make_dummy_rainfall_data(0, 1));
    context.log(make_line_rainfall_forecast_message(rain_fall));

    var rain_fall = will_stop_rainfall(make_dummy_rainfall_data(1, 0));
    context.log(make_line_rainfall_forecast_message(rain_fall));
}
    
function make_dummy_rainfall_data(a, b)
{
    return [
        { Type: 'observation', Date: '201610240000', Rainfall: 0 },
        { Type: 'observation', Date: '201610240005', Rainfall: 0 },
        { Type: 'observation', Date: '201610240010', Rainfall: 0 },
        { Type: 'observation', Date: '201610240015', Rainfall: 0 },
        { Type: 'observation', Date: '201610240020', Rainfall: 0 },
        { Type: 'observation', Date: '201610240025', Rainfall: 0 },
        { Type: 'observation', Date: '201610240030', Rainfall: 0 },
        { Type: 'observation', Date: '201610240035', Rainfall: 0 },
        { Type: 'observation', Date: '201610240040', Rainfall: 0 },
        { Type: 'observation', Date: '201610240045', Rainfall: 0 },
        { Type: 'observation', Date: '201610240050', Rainfall: 0 },
        { Type: 'observation', Date: '201610240055', Rainfall: 0 },
        { Type: 'observation', Date: '201610240100', Rainfall: a },
        { Type: 'forecast', Date: '201610240105', Rainfall: b },
        { Type: 'forecast', Date: '201610240110', Rainfall: b },
        { Type: 'forecast', Date: '201610240115', Rainfall: b },
        { Type: 'forecast', Date: '201610240120', Rainfall: b },
        { Type: 'forecast', Date: '201610240125', Rainfall: b },
        { Type: 'forecast', Date: '201610240130', Rainfall: b },
        { Type: 'forecast', Date: '201610240135', Rainfall: b },
        { Type: 'forecast', Date: '201610240140', Rainfall: b },
        { Type: 'forecast', Date: '201610240145', Rainfall: b },
        { Type: 'forecast', Date: '201610240150', Rainfall: b },
        { Type: 'forecast', Date: '201610240155', Rainfall: b },
        { Type: 'forecast', Date: '201610240200', Rainfall: b }
    ];
}
