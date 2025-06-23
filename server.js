const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const Trend = require("./models/OddTrend");

const app = express();
const cors = require("cors");
app.use(cors());
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "public")));

const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

function getISTDate() {
  const now = new Date();
  const istOffset = 5.5 * 60; // 330 minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 60000 * istOffset);
  return istTime.toISOString().split("T")[0];
}

let state = {
  live: "0",
  trend10m: "",
  trend1m: "",
  prices: {
    prev10m: "0",
    curr10m: "",
    prev1m: "0",
    curr1m: "0",
  },
  clocks: {
    clock10m: 0,
    clock1m: 0,
  },
  time: {
    minute: 0,
    second: 0,
  },
  date: getISTDate(),
};

let lockTime1m = 0;
let lockTime10m = 0;

let trendString10m = "";
let trendString1m = "";
const allPast10mTrends = [];

function updateTime() {
  const now = new Date();
  const istOffset = 5.5 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istNow = new Date(utc + 60000 * istOffset);
  state.time.minute = istNow.getMinutes();
  state.time.second = istNow.getSeconds();

  const newDate = istNow.toISOString().split("T")[0];
  if (state.date !== newDate) {
    state.date = newDate;
    trendString10m = "";
    trendString1m = "";
    state.trend10m = "";
    state.trend1m = "";
    fetchLatestTrends();
  }
}

async function fetchLatestTrends() {
  try {
    const date = getISTDate();
    const trendEntry = await Trend.findOne({ date });
    if (trendEntry) {
      trendString10m = trendEntry.trend || "";
      trendString1m = trendEntry.trend2 || "";
      state.trend10m = trendString10m;
      state.trend1m = trendString1m;
    } else {
      trendString10m = "";
      trendString1m = "";
      state.trend10m = "";
      state.trend1m = "";
    }
  } catch (error) {
    console.error("Error fetching latest trends:", error);
    trendString10m = "";
    trendString1m = "";
    state.trend10m = "";
    state.trend1m = "";
  }
}

async function fetchAllPrevious10mTrends() {
  try {
    const trends = await Trend.find({ trend: { $exists: true } }).sort({ date: 1 });

    for (const t of trends) {
      if (t.date && t.trend) {
        allPast10mTrends.push({ date: t.date, trend: t.trend });
      }
    }

    // console.log("Loaded previous 10m trends:", allPast10mTrends.length);
  } catch (err) {
    console.error("Error fetching all 10m trends:", err);
  }
}

async function saveTrendToDB({ trendType, value }) {
  const date = getISTDate();
  try {
    if (
      (trendType === "trend" && value === trendString10m) ||
      (trendType === "trend2" && value === trendString1m)
    ) {
      return;
    }

    let trendEntry = await Trend.findOne({ date });
    if (trendEntry) {
      trendEntry[trendType] = value;
    } else {
      trendEntry = new Trend({ date, [trendType]: value });
    }

    await trendEntry.save();
    await fetchLatestTrends();
    await fetchAllPrevious10mTrends();
  } catch (error) {
    console.error(`Error saving ${trendType} to DB:`, error);
  }
}

function connectWebSocket(url, onMessage) {
  const ws = new WebSocket(url);

  ws.on("open", () => console.log(`Connected to ${url}`));
  ws.on("message", onMessage);
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    setTimeout(() => connectWebSocket(url, onMessage), 5000);
  });
  ws.on("close", () => {
    console.warn("WebSocket closed. Reconnecting...");
    setTimeout(() => connectWebSocket(url, onMessage), 5000);
  });

  return ws;
}

connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade", (event) => {
  try {
    const data = JSON.parse(event);
    state.live = parseFloat(data.p).toFixed(2);
  } catch (error) {
    console.error("Error parsing live trade data:", error);
  }
});

connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_1m", async (event) => {
  try {
    updateTime();
    const data = JSON.parse(event);
    const open = parseFloat(data.k.o).toFixed(2);
    const { minute, second } = state.time;
    const now = Date.now();

    if (minute % 10 >= 8 && state.clocks.clock1m !== 0) {
      state.clocks.clock1m = 0;
    }

    if (minute % 10 === 5 && second >= 3 && state.clocks.clock1m === 0) {
      state.clocks.clock1m = 1;
      state.prices.prev1m = open;
    }

    if (minute % 10 === 6 && second >= 3 && state.clocks.clock1m === 1) {
      state.clocks.clock1m = 2;
      state.prices.curr1m = open;

      const prev = parseFloat(state.prices.prev1m);
      const curr = parseFloat(state.prices.curr1m);

      const direction = curr >= prev ? "H" : "L";
      state.trend1m = trendString1m;
      state.trend1m += direction;

      setTimeout(() => {
        saveTrendToDB({ trendType: "trend2", value: state.trend1m });
      }, 2000);
    }
  } catch (error) {
    console.error("Error handling 1m kline:", error);
  }
});

connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_5m", async (event) => {
  try {
    updateTime();
    const data = JSON.parse(event);
    const open = parseFloat(data.k.o).toFixed(2);
    const { minute, second } = state.time;
    const now = Date.now();

    if (state.prices.prev10m === "0") {
      state.prices.prev10m = open;
    }

    if (minute % 10 === 5 && second >= 3 && state.clocks.clock10m === 0 && now - lockTime10m > 8000) {
      state.clocks.clock10m = 1;
      state.prices.curr10m = open;
      lockTime10m = now;

      const prev = parseFloat(state.prices.prev10m).toFixed(2);
      const curr = parseFloat(state.prices.curr10m).toFixed(2);

      if (prev !== curr||prev === curr) {
        const direction = parseFloat(curr) >= parseFloat(prev) ? "H" : "L";
        state.trend10m = trendString10m;
        state.trend10m += direction;
        state.prices.prev10m = state.prices.curr10m;

        setTimeout(() => {
          saveTrendToDB({ trendType: "trend", value: state.trend10m });
        }, 2000);
      }
    }

    if (minute % 10 >= 8) {
      state.clocks.clock10m = 0;
    }
  } catch (error) {
    console.error("Error handling 5m kline:", error);
  }
});

app.get("/", (req, res) => {
  res.send(`Server is Live Now`);
});

app.get("/price", (req, res) => {
  res.json({
    live: state.live,
    previous_price: state.prices.prev10m,
    current_price: state.prices.curr10m,
    trend10min: state.trend10m,
    trend1min: state.trend1m,
  });
});

app.get("/all-trends", (req, res) => {
  res.json(allPast10mTrends);
});

app.get("/callback-from-server2", (req, res) => {
  res.send("Hello from Server 1!");
});

const callServer2 = () => {
  setInterval(async () => {
    try {
      await axios.get("https://odd-reviver.onrender.com/callback-from-server1");
    } catch (error) {
      console.error("Error calling Server 2:", error.message);
    }
  }, 300000);
};

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  setInterval(updateTime, 1000);
  await fetchLatestTrends();
  await fetchAllPrevious10mTrends();
  callServer2();
  console.log(`Server running on port ${PORT}`);
});
