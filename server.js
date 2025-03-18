
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const axios = require("axios");
const Trend = require("./models/Trend"); 
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });



let previous_price = "0";
let current_price = "";
let live = "0"
let trend = "";
let time = "";
let second = "";
let clock = 0;
let start = 0;
let trigger = 0;

let previous_price2 = "0";
let current_price2 = "0";
let trend2 = "";
let clock2 = 0;
let start2 = 0;

// Function to fetch the latest trends from the database
async function fetchLatestTrends() {
    try {
        const dateString = new Date().toISOString().split("T")[0]; // Get the date in YYYY-MM-DD format
        const trendEntry = await Trend.findOne({ date: dateString });
        if (trendEntry) {
            console.log("Latest Trend:", trendEntry.trend);
            console.log("Latest Trend2:", trendEntry.trend2);
        } else {
            console.log("No trends found for today.");
        }
    } catch (error) {
        console.error("Error fetching latest trends:", error);
    }
}

const timer = () => {
    const date = new Date();
    time = date.getMinutes();
    second = date.getSeconds();
    if (date.getHours() === 23 && date.getMinutes() === 5) {
        if (trigger == 0) {
            start = 1;
            start2 = 1;
            console.log("Start Now");
            trigger = 1;
        }
    }
    if (date.getHours() === 23 && date.getMinutes() === 15) {
        if (trigger == 1) {
            start = 0;
            start2 = 0;
            console.log("End Now");
            console.log("Trend1:", trend);
            console.log("Trend2:", trend2);
            trend = "";
            trend2 = ""; // Fixed: Reset trend2 instead of trend
            trigger = 0;
        }
    }
};

// Function to connect to WebSocket
function connectWebSocket(url, onMessage) {
    const ws = new WebSocket(url);

    ws.on("open", () => {
        console.log(`WebSocket connection established to ${url}`);
    });

    ws.on("message", onMessage);

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        // Attempt to reconnect after a delay
        setTimeout(() => connectWebSocket(url, onMessage), 5000);
    });

    ws.on("close", () => {
        console.log("WebSocket connection closed, attempting to reconnect...");
        // Attempt to reconnect after a delay
        setTimeout(() => connectWebSocket(url, onMessage), 5000);
    });

    return ws;
}

const wss3 = connectWebSocket(
  'wss://stream.binance.com:9443/ws/btcusdt@trade',
  async (event) => {
      if (event) {
          try {

           const data = JSON.parse(event);
           live=parseFloat(data.p).toFixed(2);
            
          } catch (error) {
            console.error("Error parsing JSON for 1m kline:", error);
        }
    } else {
        console.warn("Received an empty or undefined message for 1m kline.");
    }
}
);


// WebSocket for even candle
// const wss = connectWebSocket(
//     "wss://stream.binance.com:9443/ws/btcusdt@kline_5m",
//     async (event) => {
//         if (event) {
//             try {
//                 const data = JSON.parse(event);
//                 const k_value = data.k;
//                 const open_price = parseFloat(k_value.o).toFixed(2);

//                 if (previous_price == "0") {
//                     previous_price = open_price;
//                     console.log("Even Previous:", previous_price);
//                 }

//                 if (time % 10 == 0 && second > 2 && clock == 0) {
//                     clock = 1;
//                     current_price = open_price;

//                     if (current_price != previous_price) {
//                         trend = trend.concat(current_price > previous_price ? "H" : "L");
//                         previous_price = current_price;
//                         console.log("Even Current price:", current_price);
//                         console.log("Even Trend:", trend);

//                         const dateString = new Date().toISOString().split("T")[0]; // Get the date in YYYY-MM-DD format

//                         try {
//                             let trendEntry = await Trend.findOne({ date: dateString });

//                             if (trendEntry) {
//                                 if (trend) {
//                                     trendEntry.trend = trend;
//                                     await trendEntry.save();
//                                 }
//                             } else {
//                                 if (trend) {
//                                     trendEntry = new Trend({
//                                         date: dateString,
//                                         trend: trend,
//                                     });
//                                     await trendEntry.save();
//                                 }
//                             }

//                             // Fetch the latest trends after saving
//                             await fetchLatestTrends();
//                         } catch (error) {
//                             console.error("Error saving trend to database:", error);
//                         }
//                     }
//                 } else if (time % 10 == 1 && second > 5) {
//                     clock = 0;
//                 }
//             } catch (error) {
//                 console.error("Error parsing JSON for 1m kline:", error);
//             }
//         } else {
//             console.warn("Received an empty or undefined message for 1m kline.");
//         }
//     }
// );

// WebSocket for odd candle
const wss2 = connectWebSocket(
    "wss://stream.binance.com:9443/ws/btcusdt@kline_5m",
    async (event) => {
        if (event) {
            try { 
                const data = JSON.parse(event);
                const k_value = data.k;
                const open_price = parseFloat(k_value.o).toFixed(2);
                console.log(open_price);

                if (previous_price2 == "0") {
                    previous_price2 = open_price;
                    console.log("Odd Previous:", previous_price2);
                }

                if (time % 10 == 5 && second > 2 && clock2 == 0) {
                    clock2 = 1;
                    current_price2 = open_price;
                    if (current_price2 != previous_price2) {
                        trend2 = trend2.concat(current_price2 > previous_price2 ? "H" : "L");
                        console.log("Odd Current price:", current_price2);
                        console.log("Odd Trend:", trend2);

                        const dateString = new Date().toISOString().split("T")[0]; // Get the date in YYYY-MM-DD format

                        try {
                            let trendEntry = await Trend.findOne({ date: dateString });

                            if (trendEntry) {
                                if (trend2) {
                                    trendEntry.trend2 = trend2;
                                    await trendEntry.save();
                                }
                            } else {
                                if (trend2) {
                                    trendEntry = new Trend({
                                        date: dateString,
                                        trend2: trend2,
                                    });
                                    await trendEntry.save();
                                }
                            }

                            // Fetch the latest trends after saving
                            await fetchLatestTrends();
                        } catch (error) {
                            console.error("Error saving trend to database:", error);
                        }
                    }
                } else if (time % 10 == 7 && second > 5) {
                    clock2 = 0;
                }
            } catch (error) {
                console.error("Error parsing JSON for 5m kline:", error);
            }
        } else {
            console.warn("Received an empty or undefined message for 5m kline.");
        }
    }
);

app.get('/callback-from-server2', (req, res) => {
    console.log('Received a call from Server 2');
    res.send('Hello from Server 1!');
});

const callServer2 = () => {
    setInterval(async () => {
        try {
            const response = await axios.get('https://odd-reviver.onrender.com/callback-from-server1');
            console.log(`Response from Server 2: ${response.data}`);
        } catch (error) {
            console.error('Error calling Server 2:', error.message);
        }
    }, 60000); // 60000 milliseconds = 1 minute
};

// Start the timer to update time and manage the start condition
app.get("/", (req, res) => {
    res.send(`Server is Live Now`); // Send a response to the client
});

// Start the Express server
const PORT = process.env.PORT ||3000;
server.listen(PORT, () => {
    setInterval(timer, 1000);
    //  callServer2();
    console.log(`Server is running on port ${PORT}`);
});
