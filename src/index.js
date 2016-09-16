/**
    Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

    Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

        http://aws.amazon.com/apache2.0/

    or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

/**
 * This sample shows how to create a Lambda function for handling Alexa Skill requests that:
 * - Web service: communicate with an external web service to get tide data from NOAA CO-OPS API (http://tidesandcurrents.noaa.gov/api/)
 * - Multiple optional slots: has 2 slots (city and date), where the user can provide 0, 1, or 2 values, and assumes defaults for the unprovided values
 * - DATE slot: demonstrates date handling and formatted date responses appropriate for speech
 * - Custom slot type: demonstrates using custom slot types to handle a finite set of known values
 * - Dialog and Session state: Handles two models, both a one-shot ask and tell model, and a multi-turn dialog model.
 *   If the user provides an incorrect slot in a one-shot model, it will direct to the dialog model. See the
 *   examples section for sample interactions of these models.
 * - Pre-recorded audio: Uses the SSML 'audio' tag to include an ocean wave sound in the welcome response.
 *
 * Examples:
 * One-shot model:
 *  User:  "Alexa, ask Tide Pooler when is the high tide in Seattle on Saturday"
 *  Alexa: "Saturday June 20th in Seattle the first high tide will be around 7:18 am,
 *          and will peak at ...""
 * Dialog model:
 *  User:  "Alexa, open Tide Pooler"
 *  Alexa: "Welcome to Tide Pooler. Which city would you like tide information for?"
 *  User:  "Seattle"
 *  Alexa: "For which date?"
 *  User:  "this Saturday"
 *  Alexa: "Saturday June 20th in Seattle the first high tide will be around 7:18 am,
 *          and will peak at ...""
 */

/**
 * App ID for the skill
 */
var APP_ID = undefined;//replace with 'amzn1.echo-sdk-ams.app.[your-unique-value-here]';

var http = require('http');
var alexaDateUtil = require('./alexaDateUtil');
var cheerio = require('cheerio');
var https = require('https');

/**
 * The AlexaSkill prototype and helper functions
 */
var AlexaSkill = require('./AlexaSkill');

/**
 * TidePooler is a child of AlexaSkill.
 * To read more about inheritance in JavaScript, see the link below.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript#Inheritance
 */
var DriveThroughBoba = function () {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
DriveThroughBoba.prototype = Object.create(AlexaSkill.prototype);
DriveThroughBoba.prototype.constructor = DriveThroughBoba;

// ----------------------- Override AlexaSkill request and intent handlers -----------------------

DriveThroughBoba.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any initialization logic goes here
};

DriveThroughBoba.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    handleWelcomeRequest(response);
};

DriveThroughBoba.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any cleanup logic goes here
};

/**
 * override intentHandlers to map intent handling functions.
 */
DriveThroughBoba.prototype.intentHandlers = {

    "OneshotDtbIntent": function (intent, session, response) {
        handleOneshotDtbRequest(intent, session, response);
    },

    "DialogDtbIntent": function (intent, session, response) {
        var dateSlot = intent.slots.Date;
        if (dateSlot && dateSlot.value) {
            handleDateDialogRequest(intent, session, response);
        } else {
            handleNoSlotDialogRequest(intent, session, response);
        }
    },

    "AMAZON.HelpIntent": function (intent, session, response) {
        handleHelpRequest(response);
    },

    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    },

    "AMAZON.CancelIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    }
};

// -------------------------- TidePooler Domain Specific Business Logic --------------------------

// example city to NOAA station mapping. Can be found on: http://tidesandcurrents.noaa.gov/map/

function handleHelpRequest(response) {
    var repromptText = "Which city would you like tide information for?";
    var speechOutput = "I can lead you through providing a city and "
        + "day of the week to get tide information, "
        + "or you can simply open Tide Pooler and ask a question like, "
        + "get tide information for Seattle on Saturday. "
        + "For a list of supported cities, ask what cities are supported. "
        + "Or you can say exit. "
        + repromptText;

    response.ask(speechOutput, repromptText);
}


function handleWelcomeRequest(response) {
    var whichCityPrompt = "Which date would you like boba information for?",
        speechOutput = {
            speech: "<speak>Welcome to Drive Through Boba. "
                + "<audio src='https://s3.amazonaws.com/ask-storage/tidePooler/OceanWaves.mp3'/>"
                + whichCityPrompt
                + "</speak>",
            type: AlexaSkill.speechOutputType.SSML
        },
        repromptOutput = {
            speech: "I can lead you through providing a "
                + "day of the week to get boba information, "
                + "or you can simply open Drive Through Boba and ask a question like, "
                + "what is the special today. ",
            type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };

    response.ask(speechOutput, repromptOutput);
}

/**
 * Gets the date from the intent, defaulting to today if none provided,
 * or returns an error
 */
function getDateFromIntent(intent) {

    var dateSlot = intent.slots.Date;
    // slots can be missing, or slots can be provided but with empty value.
    // must test for both.
    if (!dateSlot || !dateSlot.value) {
        // default to today
        return {
            displayDate: "Today",
            requestDateParam: "date=today",
            date: new Date()
        }
    } else {

        var date = new Date(dateSlot.value);
        console.log("DATE INTENT: " + date);

        // format the request date like YYYYMMDD
        var month = (date.getMonth() + 1);
        month = month < 10 ? '0' + month : month;
        var dayOfMonth = date.getDate();
        dayOfMonth = dayOfMonth < 10 ? '0' + dayOfMonth : dayOfMonth;
        var requestDay = "begin_date=" + date.getFullYear() + month + dayOfMonth
            + "&range=24";

        return {
            displayDate: alexaDateUtil.getFormattedDate(date),
            requestDateParam: requestDay,
            date: date
        }
    }
}

function handleDateDialogRequest(intent, session, response) {
    var date = getDateFromIntent(intent),
        repromptText,
        speechOutput;
    if (!date) {
        repromptText = "Please try again saying a day of the week, for example, Saturday. "
            + "For which date would you like boba information?";
        speechOutput = "I'm sorry, I didn't understand that date. " + repromptText;

        response.ask(speechOutput, repromptText);
        return;
    }

    // if we don't have a city yet, go to city. If we have a city, we perform the final request
    // The user provided a date out of turn. Set date in session and prompt for city
    session.attributes.date = date;

    getFinalDtbResponse(response, date.date);
}

/**
 * This handles the one-shot interaction, where the user utters a phrase like:
 * 'Alexa, open Tide Pooler and get tide information for Seattle on Saturday'.
 * If there is an error in a slot, this will guide the user to the dialog approach.
 */

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


function getFinalDtbResponse(response, date) {
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
            // console.log(posts);

            if (posts.length > 0) {
                for (var i = 0; i < posts.length; i++) {
                    var post = posts[i];
                    // console.log(post);
                    response.tell(posts[i]);
                }
            } else {
                response.tell('Drive through boba is not open today or they haven\'t posted on facebook yet.');
            }
        });
    }).on('error', function (e) {
        console.log("Communications error: " + e.message);
    });
}

function handleOneshotDtbRequest(intent, session, response) {
    getFinalDtbResponse(response, null);
}

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    var dtb = new DriveThroughBoba();
    dtb.execute(event, context);
};


