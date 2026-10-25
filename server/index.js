import express from 'express';
import cors from 'cors';
import bodyParser, { json } from 'body-parser';
import WebSocket from 'ws';

const app = express();
const PORT = 3000;

const boats = new Map();

// Enable CORS for your local live server origin
app.use(cors()); // { origin: 'http://127.0.0.1:5501' }

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
    console.log('/ hit');
})

// Endpoint 1: Live Satellites (NORAD TLE)
app.get('/api/satellites', async (req, res) => {
    console.log('satellites hit');
    try {
        const response = await fetch('https://tle.ivanstanojevic.me/api/tle?page-size=40');
        if (!response.ok) throw new Error(`Remote status: ${response.status}`);
        // console.log('response', response);
        const data = await response.json();
        // console.log('data', data)
        res.json(data);
    } catch (error) {
        console.error('Satellite Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch satellite data', details: error.message });
    }
});

// Endpoint 2: Live Military Air Traffic (ADSB.lol)
app.get('/api/planes', async (req, res) => {
    try {
        const response = await fetch('https://api.adsb.lol/v2/mil', {
            headers: { 'User-Agent': 'GodsEyeTerminal/1.0' }
        });
        if (!response.ok) throw new Error(`Remote status: ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Air Traffic Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch air traffic data', details: error.message });
    }
});

// Endpoint 3: Live Marine/Geographic Coordinates (USGS)
app.get('/api/boats', async (req, res) => {
    // console.log(boats);
    try {
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
        if (!response.ok) throw new Error(`Remote status: ${response.status}`);
        const data = await response.json();
        // res.json(data);
        // console.log('boats', typeof boats.values())
        res.json({ boats: Array.from(boats.values()) });
    } catch (error) {
        console.error('Marine Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch marine data', details: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`👁️ God's Eye Proxy Server operational at http://localhost:${PORT}`);
});

process.on('exit', function(whyExit) {
    console.log('exit', whyExit);
    // Add shutdown logic here.
});


// const boats = new Map();

const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

ws.onopen = function(_) {
    const subscriptionMessage = {
        Apikey: process.env.API_KEY,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        // FiltersShipMMSI: ["368207620", "367719770", "211476060"], // Optional!
        FilterMessageTypes: ["PositionReport"] // Optional!
    }
    ws.send(JSON.stringify(subscriptionMessage));
};


ws.onmessage = function (event) {
    let aisMessage = JSON.parse(event.data)
    if (!boats.has(aisMessage.MetaData.MMSI)) {
        boats.set(aisMessage.MetaData.MMSI, aisMessage.Message.PositionReport);
    } else {
        boats.delete(aisMessage.MetaData.MMSI);
        boats.set(aisMessage.MetaData.MMSI, aisMessage.Message.PositionReport);
    }
};