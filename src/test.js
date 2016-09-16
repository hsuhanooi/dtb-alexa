var https = require('https');

function findTodaysPosts(json, date) {
    var today = new Date();
    if (date) {
        today = new Date(date);
    }
    var dateStr = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    console.log(dateStr);
    var todayDate = new Date(Date.parse(dateStr));
    console.log(today);

    var dateRegex = /([A-Z]+) ([0-9]+)\/([0-9]+)/;

    var data = json['data'];
    var found = false;

    var posts = [];

    for (var i = 0; i < data.length; i++) {
        if (found == false) {
            status = data[i];
            message = status['message'];

            console.log('------------------------\n\n' + message);

            var match = dateRegex.exec(message);
            // console.log(match);

            if (match) {
                var dayOfWeek = match[1];
                var month = match[2];
                var day = match[3];
                console.log('\nPARSED: ' + dayOfWeek + ' / ' + month + ' / ' + day);

                var thisDate = new Date(Date.parse(todayDate.getFullYear() + '-' + month + '-' + day));
                console.log(thisDate);
                console.log(todayDate);
                var exactMatch = (date && thisDate.getTime() == todayDate.getTime());
                var pastMatch = (!date && thisDate.getTime() >= todayDate.getTime());
                if (exactMatch || pastMatch) {
                    found = true;
                    posts.push(message);
                }
            }
        }
    }
    return posts;
}

function getFinalDtbResponse(date) {
    var page_id = 'drivethruboba';
    var access_token = '998663083549352|6446c00414910eb379221e7e77e808c7';
    var endpoint = 'https://graph.facebook.com/v2.6/' + page_id + '/feed?access_token=' + access_token;

    https.get(endpoint, function (res) {
        var noaaResponseString = '';
        console.log('Status Code: ' + res.statusCode);

        if (res.statusCode != 200) {
            // tideResponseCallback(new Error("Non 200 Response"));
        }

        res.on('data', function (data) {
            noaaResponseString += data;
        });

        res.on('end', function () {
            json = JSON.parse(noaaResponseString);
            // console.log(json);

            posts = findTodaysPosts(json, date);
            console.log(posts);

            if (posts.length > 0) {
                for (var i = 0; i < posts.length; i++) {
                    var post = posts[i];
                    console.log(post);
                    // response.tell(posts[i]);
                }
            } else {
                console.log('No posts returned. DTB is either closed or hasn\'t posted on facebook yet.');
                // response.tell('Drive through boba is not open today or they haven\'t posted on facebook yet.');
            }
        });
    }).on('error', function (e) {
        console.log("Communications error: " + e.message);
    });
}

var d = Date.parse('2016-5-29');
console.log(d);
getFinalDtbResponse(d);

