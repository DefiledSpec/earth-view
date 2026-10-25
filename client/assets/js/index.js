const PROXY_BASE = 'http://localhost:3000/api';

const viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: new Cesium.TileMapServiceImageryProvider({
        url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
    }),
    baseLayerPicker: true,
    geocoder: true,
    homeButton: true,
    sceneModePicker: true,
    navigationHelpButton: false,
    animation: true,
    timeline: true,
    creditContainer: 'creditContainer',
    infoBox: false,
});

viewer.scene.globe.enableLighting = true;



viewer.selectedEntityChanged.addEventListener(function(newEntity) {
    if (Cesium.defined(newEntity)) {
        console.log("Selected: " + newEntity);
        console.log(newEntity)
        
        // Example: Disable the default info box and run custom logic
        // viewer.selectedEntity = undefined;
    }
});

const layers = {
    satellites: { active: false, entities: [] },
    planes: { active: false, entities: [] },
    boats: { active: false, entities: [] }
};

const satelliteBtn = document.getElementById('satellitesToggle');
const planesBtn = document.getElementById('planesToggle');
const boatsBtn = document.getElementById('boatsToggle');

satelliteBtn.addEventListener("click", _ => toggleLayer('satellites'));
planesBtn.addEventListener("click", _ => toggleLayer('planes'));
boatsBtn.addEventListener("click", _ => toggleLayer('boats'));

async function toggleLayer(layerKey) {
    const layer = layers[ layerKey ];
    layer.active = !layer.active;

    const btn = document.getElementById(layerKey + 'Toggle');
    const status = document.getElementById(layerKey + 'Status');

    if (layer.active) {
        if (layerKey === 'satellites') await loadSatellites();
        if (layerKey === 'planes') await loadAirTraffic();
        if (layerKey === 'boats') await loadMarineTraffic();
        btn.classList.add('active');
        status.innerText = "ONLINE";
    } else {
        btn.classList.remove('active');
        status.innerText = "OFF";
        layer.entities.forEach(ent => viewer.entities.remove(ent));
        layer.entities = [];
    }
}


function getSatellitePosition(satrec, date) {
    if (!satrec) return null;
    const positionAndVelocity = satellite.propagate(satrec, date);
    const positionEci = positionAndVelocity.position;
    const gmst = satellite.gstime(date);
    if (!positionEci) return null;
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);
    return { longitude: positionGd.longitude, latitude: positionGd.latitude, height: positionGd.height * 1000 };
}


async function loadSatellites() {
    try {
        const response = await fetch(`${PROXY_BASE}/satellites`);
        const result = await response.json();

        result.member.forEach(satData => {
            const localSatRec = satellite.twoline2satrec(satData.line1, satData.line2);
            const ent = viewer.entities.add({
                position: new Cesium.CallbackProperty(() => {
                    const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
                    const livePos = getSatellitePosition(localSatRec, jsDate);
                    if (!livePos) return Cesium.Cartesian3.ZERO;
                    return Cesium.Cartesian3.fromRadians(livePos.longitude, livePos.latitude, livePos.height);
                }, false),
                point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#00ffc4') },
                label: {
                    text: `🛰️ ${satData.name}`, font: 'bold 12px monospace', fillColor: Cesium.Color.fromCssColorString('#00ffc4'),
                    outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12),
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 40000000.0)
                }
            });
            layers.satellites.entities.push(ent);
        });
    } catch (err) { console.error("Sat Matrix Load Error:", err); }
}


async function loadAirTraffic() {
    try {
        const response = await fetch(`${PROXY_BASE}/planes`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        console.log('data', data)
        if (data && data.ac) {
            const targetList = data.ac.filter(ac => ac.lon && ac.lat)//.slice(0, 150);
            console.log('targetList', targetList)
            targetList.forEach(flight => {
                const altitudeMeters = flight.alt_baro === "ground" ? 0 : (parseInt(flight.alt_baro) || 12000) * 0.3048;

                const ent = viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(flight.lon, flight.lat, altitudeMeters),
                    point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#ffff00') },
                    label: {
                        text: `✈️ ${flight.flight ? flight.flight.trim() : (flight.r ? flight.r : 'LIVE_HEX')}`,
                        font: 'bold 12px monospace', fillColor: Cesium.Color.fromCssColorString('#ffff00'),
                        outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12),
                        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 80000000.0)
                    },
                    properties: flight
                });
                layers.planes.entities.push(ent);
            });
        }
    } catch (err) { console.error("Air Traffic Load Error:", err); }
}


async function loadMarineTraffic() {
    try {
        const response = await fetch(`${PROXY_BASE}/boats`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();

        console.log('boatData', data)
        if (data && data.features) {
            const prefixes = [ "MAERSK", "MSC", "CMA CGM", "EVER", "ONE", "HAPAG" ];
            const suffixes = [ "LEADER", "MARU", "DISCOVERY", "ZEPHYR", "TRADER", "TITAN" ];

            const marineDataJson = data.features.map((feat, idx) => ({ // .slice(0, 60)
                name: `${feat.id} (${feat.properties.title})`,
                lon: feat.geometry.coordinates[ 0 ],
                lat: feat.geometry.coordinates[ 1 ]
            }));

            marineDataJson.forEach(vessel => {
                const ent = viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0),
                    point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#ff9900') },
                    label: {
                        text: `🚢 ${vessel.name}`, font: 'bold 12px monospace', fillColor: Cesium.Color.fromCssColorString('#ff9900'),
                        outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -12),
                        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 50000000.0)
                    }
                });
                layers.boats.entities.push(ent);
            });
        } else if (data && data.boats) {
            const marineDataJson = data.boats.map((boat, idx) => ({
                name: boat.UserID,
                lon: boat.Longitude,
                lat: boat.Latitude
            }));

            marineDataJson.forEach(vessel => {
                const ent = viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 0),
                    point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#ff9900') },
                    label: {
                        text: `🚢 ${vessel.name}`, font: 'bold 12px monospace', fillColor: Cesium.Color.fromCssColorString('#ff9900'),
                        outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM, 
                        pixelOffset: new Cesium.Cartesian2(0, -12),
                        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 5000000.0)
                    }
                });
                layers.boats.entities.push(ent);
            });
        }
    } catch (err) { console.error("Marine Traffic Load Error:", err); }
}
