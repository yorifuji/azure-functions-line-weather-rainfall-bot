
var https = require("https");
var url = require("url");

var yr = require("./yahoo_rainfall.js");

function push_line(messages)
{
    if (!messages.length) return Promise.resolve();

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

function main(context) {
    const api_key = process.env.YAHOO_APP_ID;
    const lon = process.env.LONGITUDE;
    const lat = process.env.LATITUDE;

    yr.get_weather_data(api_key, lon, lat)
        .then(yr.get_rainfall_data)
        .then(yr.make_rainfall_message)
        .then(push_line)
        .then(result => {
            context.log(result);
            context.done();
        }).catch(err => {
            context.log(err.message);
            context.done();
        });
}

module.exports = function (context, myTimer) {
    var timeStamp = new Date().toISOString();
    
    if(myTimer.isPastDue)
    {
        context.log('Node.js is running late!');
    }
    context.log('Node.js timer trigger function ran!', timeStamp);   

    main(context);
};

if (require.main === module) {

    const api_key = process.env.YAHOO_APP_ID;
    const lon = process.env.lon ? process.env.lon : "139.753945";
    const lat = process.env.lat ? process.env.lat : "35.683801";
    
    var context = {
        log : console.log,
        done: () => {}
    };

    yr.get_weather_data(api_key, lon, lat)
        .then(yr.get_rainfall_data)
        .then(yr.make_rainfall_message)
        .then(context.log)
	.catch(context.log);
	       
}
