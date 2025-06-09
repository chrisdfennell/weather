document.addEventListener('DOMContentLoaded', () => {
    const OPENCAGE_API_KEY = 'a75373f1767c4920b1fcba13f2a19d40';
    const OPENWEATHER_API_KEY = '0f69e0dea4ecfa48727efb4c88ac7457';
    
    const DOMElements = { geoBtn:document.getElementById('geo-btn'),searchBtn:document.getElementById('search-btn'),locationInput:document.getElementById('location-input'),loadingOverlay:document.getElementById('loading-overlay'),weatherContent:document.getElementById('weather-content'),errorContainer:document.getElementById('error-container'),errorMessage:document.getElementById('error-message'),locationNameEl:document.getElementById('location-name'),currentTimeEl:document.getElementById('current-time'),saveLocationBtn:document.getElementById('save-location-btn'),savedLocationsContainer:document.getElementById('saved-locations-container'),currentConditionsContainer:document.getElementById('current-conditions'),forecastContainer:document.getElementById('forecast-container'),hourlyForecastContainer:document.getElementById('hourly-forecast-container'),alertsContainer:document.getElementById('alerts-container'),metarContainer:document.getElementById('metar-container'),astroContainer:document.getElementById('astro-container'),aqiContainer:document.getElementById('aqi-container'),hourlyChartEl:document.getElementById('hourly-chart'),mapLayersBtn:document.getElementById('map-layers-btn'),mapControls:document.getElementById('map-controls'),fullscreenMapBtn:document.getElementById('fullscreen-map-btn'),mapCard:document.getElementById('map-card'),settingsBtn:document.getElementById('settings-btn'),settingsModal:document.getElementById('settings-modal'),closeSettingsBtn:document.getElementById('close-settings-btn'),themeLightBtn:document.getElementById('theme-light-btn'),themeDarkBtn:document.getElementById('theme-dark-btn'),unitTempBtn:document.getElementById('unit-temp-btn'),unitWindBtn:document.getElementById('unit-wind-btn'),unitPressureBtn:document.getElementById('unit-pressure-btn'),unitDistanceBtn:document.getElementById('unit-distance-btn'),leftColumn: document.getElementById('left-column'), rightColumn: document.getElementById('right-column')};
    let map, hourlyChart, baseMapLayer, mapMarker, clickMarker;
    let mapLayers = {};
    let stationMarkers = [];
    const weatherCache = new Map();
    let currentWeatherData = null;
    let settings = { theme:'dark',tempUnit:'f',windUnit:'mph',pressureUnit:'inHg',distanceUnit:'mi',activeMapLayer:'precipitation',savedLocations:[], cardLayout: { left: [], right: [] } };
    let originalParent = null;
    let originalNextSibling = null;
    
    function init() { loadSettings(); displaySavedLocations(); applyCardOrder(); applyTheme(); updateSettingsUI(); initSortable(); lucide.createIcons(); showLoading(); handleInitialLocation(); setupEventListeners(); }
    function setupEventListeners(){DOMElements.geoBtn.addEventListener('click',handleGeoButtonClick);DOMElements.searchBtn.addEventListener('click',handleSearch);DOMElements.locationInput.addEventListener('keypress',e=>e.key==='Enter'&&handleSearch());DOMElements.settingsBtn.addEventListener('click',()=>DOMElements.settingsModal.classList.remove('hidden'));DOMElements.closeSettingsBtn.addEventListener('click',()=>DOMElements.settingsModal.classList.add('hidden'));DOMElements.settingsModal.addEventListener('click',e=>e.target===DOMElements.settingsModal&&DOMElements.settingsModal.classList.add('hidden'));DOMElements.themeLightBtn.addEventListener('click',()=>updateSetting('theme','light'));DOMElements.themeDarkBtn.addEventListener('click',()=>updateSetting('theme','dark'));DOMElements.unitTempBtn.addEventListener('click',()=>updateSetting('tempUnit',settings.tempUnit==='f'?'c':'f'));DOMElements.unitWindBtn.addEventListener('click',()=>{const u=['mph','kph','knots'];const i=(u.indexOf(settings.windUnit)+1)%u.length;updateSetting('windUnit',u[i]);});DOMElements.unitPressureBtn.addEventListener('click',()=>updateSetting('pressureUnit',settings.pressureUnit==='inHg'?'hPa':'inHg'));DOMElements.unitDistanceBtn.addEventListener('click',()=>updateSetting('distanceUnit',settings.distanceUnit==='mi'?'km':'mi'));DOMElements.saveLocationBtn.addEventListener('click',toggleSaveLocation);DOMElements.mapLayersBtn.addEventListener('click', ()=>DOMElements.mapControls.classList.toggle('hidden'));document.addEventListener('click',(e)=>{if(DOMElements.mapControls&&!DOMElements.mapControls.contains(e.target)&&!DOMElements.mapLayersBtn.contains(e.target))DOMElements.mapControls.classList.add('hidden');});DOMElements.fullscreenMapBtn.addEventListener('click', toggleMapFullscreen);document.addEventListener('keydown', (e) => {if (e.key === "Escape" && document.body.classList.contains('fullscreen-active')) {toggleMapFullscreen();}});}
    function loadSettings(){const s=localStorage.getItem('weatherAppSettings');if(s)settings={...settings,...JSON.parse(s)};}
    function saveSettings(){localStorage.setItem('weatherAppSettings',JSON.stringify(settings));}
    function applyTheme(){document.body.classList.toggle('light-mode',settings.theme==='light');if(baseMapLayer)baseMapLayer.setUrl(`https://{s}.basemaps.cartocdn.com/${settings.theme==='light'?'light_all':'dark_all'}/{z}/{x}/{y}{r}.png`);if(hourlyChart){hourlyChart.options.scales.x.ticks.color=getComputedStyle(document.body).getPropertyValue('--text-color');hourlyChart.options.scales.y.ticks.color=getComputedStyle(document.body).getPropertyValue('--text-color');hourlyChart.update();}}
    function updateSetting(key,value){settings[key]=value;saveSettings();if(key==='theme')applyTheme();updateSettingsUI();if(currentWeatherData)displayAllWeatherData(currentWeatherData.weather,currentWeatherData.hourly,currentWeatherData.gridData,currentWeatherData.alerts,currentWeatherData.observation,currentWeatherData.sun,currentWeatherData.aqi,currentWeatherData.stations,currentWeatherData.lat,currentWeatherData.lon,currentWeatherData.locationName);}
    function updateSettingsUI(){DOMElements.themeLightBtn.classList.toggle('bg-blue-600',settings.theme==='light');DOMElements.themeLightBtn.classList.toggle('text-white',settings.theme==='light');DOMElements.themeDarkBtn.classList.toggle('bg-blue-600',settings.theme==='dark');DOMElements.themeDarkBtn.classList.toggle('text-white',settings.theme==='dark');DOMElements.unitTempBtn.textContent=settings.tempUnit==='f'?'Fahrenheit (°F)':'Celsius (°C)';DOMElements.unitWindBtn.textContent=settings.windUnit;DOMElements.unitPressureBtn.textContent=settings.pressureUnit;DOMElements.unitDistanceBtn.textContent=settings.distanceUnit==='mi'?'Miles':'Kilometers';}
    function showLoading(){DOMElements.loadingOverlay.classList.remove('hidden');DOMElements.weatherContent.classList.add('hidden');DOMElements.errorContainer.classList.add('hidden');}
    function hideLoading(){DOMElements.loadingOverlay.classList.add('hidden');}
    function showContent(){DOMElements.weatherContent.classList.remove('hidden');hideLoading();if(map)setTimeout(()=>map.invalidateSize(),1);}
    function showError(message){DOMElements.errorMessage.textContent=message;DOMElements.errorContainer.classList.remove('hidden');hideLoading();}
    function getIconForWeather(shortForecast,isDaytime){if(!shortForecast)return'sun';const fc=shortForecast.toLowerCase();if(fc.includes('thunderstorms'))return'cloud-lightning';if(fc.includes('rain')||fc.includes('shower'))return'cloud-rain';if(fc.includes('snow'))return'cloud-snow';if(fc.includes('fog')||fc.includes('haze'))return'cloudy';if(fc.includes('sunny')||fc.includes('clear'))return isDaytime?'sun':'moon';if(fc.includes('partly cloudy'))return isDaytime?'cloud-sun':'cloud-moon';return'cloud';}
    function convertTemp(tC){if(tC==null)return'N/A';const tF=tC*9/5+32;return settings.tempUnit==='f'?`${Math.round(tF)}°F`:`${Math.round(tC)}°C`;}
    function convertTempF(tF){if(tF==null)return'N/A';return settings.tempUnit==='f'?`${Math.round(tF)}°F`:`${Math.round((tF-32)*5/9)}°C`;}
    function convertSpeed(val,inUnit){if(val==null)return'N/A';let mph;if(inUnit==='m/s')mph=parseFloat(val)*2.23694;else mph=parseFloat(val);if(settings.windUnit==='mph')return`${Math.round(mph)} mph`;if(settings.windUnit==='kph')return`${Math.round(mph*1.60934)} kph`;if(settings.windUnit==='knots')return`${Math.round(mph*0.868976)} knots`;}
    function convertPressure(p){if(p==null)return'N/A';return settings.pressureUnit==='inHg'?`${(p/3386.39).toFixed(2)} inHg`:`${(p/100).toFixed(0)} hPa`;}
    function convertDistance(m){if(m==null)return'N/A';return settings.distanceUnit==='mi'?`${(m/1609.34).toFixed(1)} mi`:`${(m/1000).toFixed(1)} km`;}
    function handleGeoButtonClick(){showLoading();navigator.geolocation.getCurrentPosition(p=>getWeatherForCoords(p.coords.latitude,p.coords.longitude),e=>showError("Could not retrieve your location."));}
    function handleInitialLocation(){navigator.geolocation.getCurrentPosition(p=>getWeatherForCoords(p.coords.latitude,p.coords.longitude),e=>{console.warn(`Geolocation error: ${e.message}`);showError("Could not get your location. Showing default: Washington D.C.");getWeatherForCoords(38.8951,-77.0364,"Washington, D.C.");});}
    async function handleSearch(){const q=DOMElements.locationInput.value.trim();if(!q){showError("Please enter a location.");return;}showLoading();try{const r=await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(q)}&key=${OPENCAGE_API_KEY}&limit=1&countrycode=us`);const d=await r.json();if(r.ok&&d.results&&d.results.length>0){const{lat,lng}=d.results[0].geometry;getWeatherForCoords(lat,lng,d.results[0].formatted);}else showError("Could not find the location. Please try again.");}catch(e){console.error("Geocoding Error:",e);showError("Failed to fetch location data.");}}
    function toggleSaveLocation(){if(DOMElements.saveLocationBtn.disabled&&!settings.savedLocations.some(l=>l.name===currentWeatherData.locationName))return;const loc={name:currentWeatherData.locationName,lat:currentWeatherData.lat,lon:currentWeatherData.lon};const index=settings.savedLocations.findIndex(l=>l.name===loc.name);if(index>-1){settings.savedLocations.splice(index,1);}else{if(settings.savedLocations.length<5){settings.savedLocations.push(loc);}}saveSettings();displaySavedLocations();updateSaveLocationButton();}
    function displaySavedLocations(){DOMElements.savedLocationsContainer.innerHTML='';settings.savedLocations.forEach(loc=>{const btn=document.createElement('button');btn.className='saved-location-btn text-sm px-3 py-1 rounded-full flex items-center gap-2';btn.innerHTML=`<span>${loc.name}</span><i data-lucide="x" class="w-4 h-4 text-subtle hover:text-white remove-loc-btn"></i>`;const removeBtn=btn.querySelector('.remove-loc-btn');if(removeBtn){removeBtn.onclick=e=>{e.stopPropagation();settings.savedLocations=settings.savedLocations.filter(l=>l.name!==loc.name);saveSettings();displaySavedLocations();updateSaveLocationButton();};}btn.onclick=()=>getWeatherForCoords(loc.lat,loc.lon,loc.name);DOMElements.savedLocationsContainer.appendChild(btn);});lucide.createIcons();}
    function updateSaveLocationButton(){if(!currentWeatherData||!currentWeatherData.locationName)return;const isSaved=settings.savedLocations.some(l=>l.name===currentWeatherData.locationName);const canSave=settings.savedLocations.length<5;DOMElements.saveLocationBtn.innerHTML=`<i data-lucide="${isSaved?'star':'star'}" class="${isSaved?'fill-yellow-400 text-yellow-400':''}"></i>`;if(isSaved){DOMElements.saveLocationBtn.title="Unsave this location";DOMElements.saveLocationBtn.disabled=false;}else if(!canSave){DOMElements.saveLocationBtn.title="You can only save up to 5 locations";DOMElements.saveLocationBtn.disabled=true;DOMElements.saveLocationBtn.innerHTML=`<i data-lucide="star" class="text-gray-500"></i>`;}else{DOMElements.saveLocationBtn.title="Save this location";DOMElements.saveLocationBtn.disabled=false;}lucide.createIcons();}

    async function getWeatherForCoords(lat, lon, locationName = null) {
        lat = parseFloat(lat.toFixed(4));
        lon = parseFloat(lon.toFixed(4));
        const cacheKey = `${lat},${lon}`;
        if(weatherCache.has(cacheKey)){const d=weatherCache.get(cacheKey);currentWeatherData={...d,lat,lon};displayAllWeatherData(d.weather,d.hourly,d.gridData,d.alerts,d.observation,d.sun,d.aqi,d.stations,lat,lon,d.locationName);return;}
        showLoading();
        try {
            const pResponse=await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: { 'User-Agent': '(myweatherapp.com, contact@myweatherapp.com)' } });if(!pResponse.ok)throw new Error(`Weather data not available for this location.`);
            const pData=await pResponse.json();
            if(!pData.properties) throw new Error("Invalid data received from weather.gov/points");
            const{forecast:fUrl,forecastHourly:hUrl,forecastGridData:gUrl,observationStations:oUrl}=pData.properties;
            const fName=locationName||`${pData.properties.relativeLocation.properties.city}, ${pData.properties.relativeLocation.properties.state}`;
            
            let stationList = [];
            try {
                const oResponse = await fetch(oUrl);
                if (oResponse.ok) {
                    const oStations = await oResponse.json();
                    if (oStations.features && oStations.features.length > 0) stationList = oStations.features;
                }
            } catch (e) { console.warn("Could not fetch observation stations:", e); }

            const promises = {
                weather: fetch(fUrl), hourly: fetch(hUrl), gridData: fetch(gUrl),
                alerts: fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`),
                sun: fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`),
                observation: stationList.length > 0 ? fetch(`${stationList[0].id}/observations/latest`) : Promise.resolve(null),
                aqi: fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`),
            };

            const results = await Promise.allSettled(Object.values(promises));
            const [wResult, hResult, gResult, aResult, sResult, obResult, aqResult] = results;

            if (wResult.status !== 'fulfilled' || hResult.status !== 'fulfilled' || gResult.status !== 'fulfilled') throw new Error("Failed to fetch core weather forecast data.");
            
            const wData = await wResult.value.json(); const hData = await hResult.value.json(); const gData = await gResult.value.json();
            const alData = aResult.status === 'fulfilled' && aResult.value.ok ? await aResult.value.json() : { features: [] };
            const sData = sResult.status === 'fulfilled' && sResult.value.ok ? await sResult.value.json() : { results: null };
            const obData = obResult.status === 'fulfilled' && obResult.value?.ok ? await obResult.value.json() : null;
            const aqData = aqResult.status === 'fulfilled' && aqResult.value?.ok ? await aqResult.value.json() : null;

            const dataToCache={weather:wData,hourly:hData,gridData:gData,alerts:alData,observation:obData,sun:sData.results,aqi:aqData,stations:stationList,locationName:fName};
            weatherCache.set(cacheKey,dataToCache);currentWeatherData={...dataToCache,lat,lon};
            displayAllWeatherData(wData,hData,gData,alData,obData,sData.results,aqData,stationList,lat,lon,fName);

        } catch(e){console.error("Weather Fetch Error:",e);showError(e.message);}
    }

    function displayAllWeatherData(weather,hourly,gridData,alerts,observation,sun,aqi,stations,lat,lon,name){DOMElements.locationNameEl.textContent=name;DOMElements.currentTimeEl.textContent=`Last updated: ${new Date().toLocaleTimeString()}`;updateSaveLocationButton();displayCurrentConditions(weather?.properties?.periods[0],gridData?.properties);displayHourlyForecast(hourly?.properties?.periods);displayHourlyChart(hourly?.properties?.periods);displayForecast(weather?.properties?.periods);displayAlerts(alerts?.features);displayMetar(observation);displayAstro(sun);displayAqi(aqi);initializeOrUpdateMap(lat,lon,stations);showContent();}
    function displayHourlyForecast(periods){if(!periods){DOMElements.hourlyForecastContainer.innerHTML='';return;}const c=DOMElements.hourlyForecastContainer;c.innerHTML='';periods.slice(0,24).forEach(p=>{const card=document.createElement('div');card.className='flex-shrink-0 text-center p-3 rounded-lg weather-card w-28';card.innerHTML=`<p class="font-semibold">${new Date(p.startTime).toLocaleTimeString('en-US',{hour:'numeric'})}</p><i data-lucide="${getIconForWeather(p.shortForecast,p.isDaytime)}" class="w-10 h-10 mx-auto my-2 text-yellow-400"></i><p class="font-bold text-lg">${convertTempF(p.temperature)}</p><p class="text-xs text-subtle">${convertSpeed(parseFloat(p.windSpeed),'mph')}</p>`;c.appendChild(card);});lucide.createIcons();}
    function displayHourlyChart(periods){if(!periods){return}const ctx=DOMElements.hourlyChartEl.getContext('2d');const data=periods.slice(0,24);const labels=data.map(p=>new Date(p.startTime).toLocaleTimeString('en-US',{hour:'2-digit'}));const tempData=data.map(p=>settings.tempUnit==='f'?p.temperature:(p.temperature-32)*5/9);const precipData=data.map(p=>p.probabilityOfPrecipitation.value||0);if(hourlyChart)hourlyChart.destroy();hourlyChart=new Chart(ctx,{type:'bar',data:{labels,datasets:[{type:'line',label:`Temperature (${settings.tempUnit.toUpperCase()})`,data:tempData,borderColor:'#facc15',yAxisID:'yTemp',tension:0.3,},{type:'bar',label:'Precipitation %',data:precipData,backgroundColor:'rgba(59,130,246,0.5)',yAxisID:'yPrecip',barPercentage:0.7,}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{color:getComputedStyle(document.body).getPropertyValue('--text-color')}},yTemp:{position:'left',ticks:{color:'#facc15',callback:v=>`${v}°`}},yPrecip:{position:'right',max:100,grid:{drawOnChartArea:false},ticks:{color:'rgba(59,130,246,0.8)',callback:v=>`${v}%`}},}}});}
    function displayCurrentConditions(current,gridProps){if(!current||!gridProps){DOMElements.currentConditionsContainer.innerHTML=`<p>Current conditions not available.</p>`;return;}const icon=getIconForWeather(current.shortForecast,current.isDaytime);const pressure=gridProps.barometricPressure?.values[0]?.value;const dewpointC=gridProps.dewpoint?.values[0]?.value;const visibility=gridProps.visibility?.values[0]?.value;const humidityHtml=current.relativeHumidity?.value!=null?`<div class="flex items-center gap-3 text-subtle"><i data-lucide="droplets" class="w-5 h-5"></i><span>Humidity: ${current.relativeHumidity.value}%</span></div>`:'';const feelsLikeTempC = gridProps.apparentTemperature?.values[0]?.value;DOMElements.currentConditionsContainer.innerHTML=`<div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="flex flex-col items-center justify-center text-center"><i data-lucide="${icon}" class="w-24 h-24 text-yellow-400"></i><p class="text-xl font-medium mt-2">${current.shortForecast}</p></div><div class="space-y-3"><p class="text-6xl font-bold">${convertTempF(current.temperature)}</p><p class="text-subtle -mt-2">Feels like ${convertTemp(feelsLikeTempC)}</p><div class="flex items-center gap-3 text-subtle"><i data-lucide="wind" class="w-5 h-5"></i><span>${convertSpeed(parseFloat(current.windSpeed),'mph')} ${current.windDirection}</span></div>${humidityHtml}</div></div><div class="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-dashed" style="border-color:var(--border-color);"><p class="text-subtle mb-4">${current.detailedForecast||''}</p><div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm"><div class="flex items-center gap-2"><i data-lucide="gauge" class="w-5 h-5 text-cyan-400"></i><div><strong>Pressure</strong><br>${convertPressure(pressure)}</div></div><div class="flex items-center gap-2"><i data-lucide="thermometer-snowflake" class="w-5 h-5 text-cyan-400"></i><div><strong>Dew Point</strong><br>${convertTemp(dewpointC)}</div></div><div class="flex items-center gap-2"><i data-lucide="eye" class="w-5 h-5 text-cyan-400"></i><div><strong>Visibility</strong><br>${convertDistance(visibility)}</div></div></div></div>`;lucide.createIcons();}
    function getMetarFlightCategory(visM,cLayers){if(visM==null||!cLayers)return{category:'N/A',emoji:'❓'};const visMi=visM/1609.34;const ceilLayer=cLayers.find(l=>['BKN','OVC'].includes(l.amount));const ceilFt=ceilLayer?ceilLayer.base.value:null;if(ceilFt<500||visMi<1)return{category:'LIFR',emoji:'🟣'};if((ceilFt&&ceilFt<1000)||visMi<3)return{category:'IFR',emoji:'🔴'};if((ceilFt&&ceilFt<=3000)||visMi<=5)return{category:'MVFR',emoji:'🔵'};return{category:'VFR',emoji:'🟢'};}
    function displayMetar(obs){if(!obs||!obs.properties){DOMElements.metarContainer.innerHTML=`<p class="text-subtle">No METAR observation data available.</p>`;return;}const p=obs.properties;const fc=getMetarFlightCategory(p.visibility.value,p.cloudLayers);const wd=p.windDirection.value===null?'Variable':`${p.windDirection.value}°`;const c=p.cloudLayers.map(l=>`${l.base.value} ft (${l.amount})`).join('<br>')||'Clear';DOMElements.metarContainer.innerHTML=`<div class="space-y-3"><p class="text-lg font-bold flex items-center gap-2">${fc.emoji} ${fc.category}</p><p class="metar-raw">${p.rawMessage}</p><div class="text-sm space-y-2"><p><strong>🕒 Time:</strong> ${new Date(p.timestamp).toLocaleString()}</p><p><strong>💨 Wind:</strong> ${wd} at ${convertSpeed(p.windSpeed.value,'m/s')}</p><p><strong>👁️ Visibility:</strong> ${convertDistance(p.visibility.value)}</p><p><strong>🌡️ Temp/Dew:</strong> ${convertTemp(p.temperature.value)} / ${convertTemp(p.dewpoint.value)}</p><p><strong>⏲️ Pressure:</strong> ${convertPressure(p.barometricPressure.value)}</p><p><strong>☁️ Clouds:</strong><br>${c}</p></div></div>`;}
    function getMoonPhase(date=new Date()){const J2000=2451545.0;const LUNAR_MONTH=29.530588853;const julianDate=date.getTime()/86400000+2440587.5;const daysSinceNew=julianDate-J2000;const newMoons=daysSinceNew/LUNAR_MONTH;const phase=newMoons%1;const phases=['🌑 New','🌒 Waxing Crescent','🌓 First Quarter','🌔 Waxing Gibbous','🌕 Full','🌖 Waning Gibbous','🌗 Last Quarter','🌘 Waning Crescent'];return phases[Math.floor(phase*8)];}
    function displayAstro(sun){
        const c=DOMElements.astroContainer;
        if(!sun||!sun.sunrise){c.innerHTML = `<p class="text-subtle text-center">Astronomical data not available.</p>`; return;}
        
        const dayLength=new Date(sun.day_length*1000).toISOString().substr(11,8);
        const moonPhase=getMoonPhase();
        const moonPhaseEmoji = moonPhase.split(' ')[0];
        const moonPhaseText = moonPhase.substring(moonPhase.indexOf(' ') + 1);

        let sunHtml = `
            <div class="flex-1"><i data-lucide="sunrise" class="w-10 h-10 text-yellow-400 mx-auto mb-1"></i><p class="font-bold">Sunrise</p><p>${new Date(sun.sunrise).toLocaleTimeString()}</p></div>
            <div class="flex-1"><i data-lucide="sunset" class="w-10 h-10 text-orange-400 mx-auto mb-1"></i><p class="font-bold">Sunset</p><p>${new Date(sun.sunset).toLocaleTimeString()}</p></div>
            <div class="flex-1"><i data-lucide="timer" class="w-10 h-10 text-subtle mx-auto mb-1"></i><p class="font-bold">Day Length</p><p>${dayLength}</p></div>
            <div class="flex-1"><p class="text-3xl mx-auto mb-1">${moonPhaseEmoji}</p><p class="font-bold">Moon Phase</p><p>${moonPhaseText}</p></div>
        `;
        
        let twilightHtml = `
            <div class="mt-4 pt-4 border-t border-dashed border-gray-700/50 text-xs text-center grid grid-cols-3 gap-2">
                <div><p class="font-bold">Civil Twilight</p><p class="text-subtle">${new Date(sun.civil_twilight_begin).toLocaleTimeString()} - ${new Date(sun.civil_twilight_end).toLocaleTimeString()}</p></div>
                <div><p class="font-bold">Nautical Twilight</p><p class="text-subtle">${new Date(sun.nautical_twilight_begin).toLocaleTimeString()} - ${new Date(sun.nautical_twilight_end).toLocaleTimeString()}</p></div>
                <div><p class="font-bold">Astronomical Twilight</p><p class="text-subtle">${new Date(sun.astronomical_twilight_begin).toLocaleTimeString()} - ${new Date(sun.astronomical_twilight_end).toLocaleTimeString()}</p></div>
            </div>
        `;

        c.innerHTML=`<div class="flex justify-around items-start text-center">${sunHtml}</div>${twilightHtml}`;
        lucide.createIcons();
    }
    function getAqiInfo(i){switch(i){case 1:return{text:'Good',color:'text-green-400'};case 2:return{text:'Fair',color:'text-yellow-400'};case 3:return{text:'Moderate',color:'text-orange-400'};case 4:return{text:'Poor',color:'text-red-500'};case 5:return{text:'Very Poor',color:'text-purple-500'};default:return{text:'Unknown',color:'text-gray-400'};}}
    function displayAqi(aqi){if(!aqi||!aqi.list||!aqi.list[0]){DOMElements.aqiContainer.innerHTML=`<p class="text-subtle">AQI data not available.</p>`;return;}const{main,components}=aqi.list[0];const info=getAqiInfo(main.aqi);DOMElements.aqiContainer.innerHTML=`<div class="text-center mb-4"><p class="text-6xl font-bold ${info.color}">${main.aqi}</p><p class="text-xl font-semibold ${info.color}">${info.text}</p></div><div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><span><strong>CO:</strong> ${components.co.toFixed(2)} μg/m³</span><span><strong>NO₂:</strong> ${components.no2.toFixed(2)} μg/m³</span><span><strong>O₃:</strong> ${components.o3.toFixed(2)} μg/m³</span><span><strong>SO₂:</strong> ${components.so2.toFixed(2)} μg/m³</span><span><strong>PM2.5:</strong> ${components.pm2_5.toFixed(2)} μg/m³</span><span><strong>PM10:</strong> ${components.pm10.toFixed(2)} μg/m³</span></div>`;}
    function displayForecast(periods) {
        if(!periods){DOMElements.forecastContainer.innerHTML='';return;}
        DOMElements.forecastContainer.innerHTML = '';
        let dailyForecasts = {};
        periods.forEach(period => {
            const dayKey = new Date(period.startTime).toISOString().split('T')[0];
            if (!dailyForecasts[dayKey]) {
                dailyForecasts[dayKey] = {
                    name: period.name.replace(/\sNight/, '').replace('This ', ''),
                    shortForecasts: [],
                    icons: [],
                    temps: []
                };
            }
            dailyForecasts[dayKey].temps.push(period.temperature);
            dailyForecasts[dayKey].shortForecasts.push(period.shortForecast);
            dailyForecasts[dayKey].icons.push(getIconForWeather(period.shortForecast, period.isDaytime));
        });

        Object.values(dailyForecasts).slice(0, 7).forEach(day => {
            const card = document.createElement('div');
            card.className = 'flex flex-col items-center justify-between p-3 rounded-lg weather-card text-center';
            const high = Math.max(...day.temps);
            const low = Math.min(...day.temps);
            const dayIcon = day.icons[0];
            const forecastText = day.shortForecasts[0];

            card.innerHTML = `
                <p class="font-semibold text-lg">${day.name}</p>
                <i data-lucide="${dayIcon}" class="w-16 h-16 text-cyan-400 my-2"></i>
                <div class="font-semibold text-lg">
                    <span>${convertTempF(high)}</span>
                    <span class="text-subtle">/ ${convertTempF(low)}</span>
                </div>
                <p class="text-subtle text-sm mt-1">${forecastText}</p>`;
            DOMElements.forecastContainer.appendChild(card);
        });
        lucide.createIcons();
    }
    function displayAlerts(alerts){if(!alerts){DOMElements.alertsContainer.innerHTML=``;return}if(alerts.length===0){DOMElements.alertsContainer.innerHTML=``;}else{DOMElements.alertsContainer.innerHTML=alerts.map(a=>{const{severity,event,headline,description,effective}=a.properties;const c={Extreme:'bg-red-800/30 border-red-500/50',Severe:'bg-orange-800/30 border-orange-500/50',Moderate:'bg-yellow-800/30 border-yellow-500/50'}[severity]||'bg-gray-700/30 border-gray-500/50';return`<div class="p-4 rounded-lg border ${c} mb-4"><h4 class="text-xl font-bold mb-2 flex items-center gap-2"><i data-lucide="alert-triangle"></i>${event}</h4><p class="text-sm text-subtle mb-2">Effective: ${new Date(effective).toLocaleString()}</p><p class="mb-2">${headline}</p><details><summary class="cursor-pointer text-blue-400 hover:underline">More Info</summary><p class="mt-2 text-subtle">${description.replace(/\n/g,'<br>')}</p></details></div>`;}).join('');lucide.createIcons();}}
    function setupMapLayers(lat,lon){mapLayers.precipitation=L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`,{attribution:'OpenWeatherMap'});mapLayers.clouds=L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`,{attribution:'OpenWeatherMap'});mapLayers.temperature=L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`,{attribution:'OpenWeatherMap'});mapLayers.radar=L.tileLayer('https://tilecache.rainviewer.com/v2/radar/nowcast-0-dBR.png',{attribution:'RainViewer'});DOMElements.mapControls.innerHTML='';const layers=[{id:'radar',name:'Radar'},{id:'precipitation',name:'Precipitation'},{id:'clouds',name:'Clouds'},{id:'temperature',name:'Temperature'}];layers.forEach(l=>{const btn=document.createElement('button');btn.textContent=l.name;btn.className='map-layer-btn p-2 text-sm rounded-md shadow-lg w-full text-left hover:bg-gray-700';if(settings.activeMapLayer===l.id)btn.classList.add('active');btn.onclick=()=>switchMapLayer(l.id);DOMElements.mapControls.appendChild(btn);});}
    function switchMapLayer(layerId){if(settings.activeMapLayer&&mapLayers[settings.activeMapLayer]){map.removeLayer(mapLayers[settings.activeMapLayer]);}if(mapLayers[layerId]){map.addLayer(mapLayers[layerId]);}settings.activeMapLayer=layerId;saveSettings();Array.from(DOMElements.mapControls.children).forEach(btn=>{btn.classList.toggle('active',btn.textContent.toLowerCase()===layerId);});DOMElements.mapControls.classList.add('hidden');}
    
    function initSortable() {
        const options = {
            group: 'weather-cards', // Allow dragging between columns
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                const leftOrder = Array.from(DOMElements.leftColumn.children).map(el => el.id);
                const rightOrder = Array.from(DOMElements.rightColumn.children).map(el => el.id);
                settings.cardLayout = { left: leftOrder, right: rightOrder };
                saveSettings();
            }
        };
        new Sortable(DOMElements.leftColumn, options);
        new Sortable(DOMElements.rightColumn, options);
    }

    function applyCardOrder() {
        if (settings.cardLayout && settings.cardLayout.left.length) {
            settings.cardLayout.left.forEach(cardId => {
                const card = document.getElementById(cardId);
                if(card) DOMElements.leftColumn.appendChild(card);
            });
        }
        if (settings.cardLayout && settings.cardLayout.right.length) {
            settings.cardLayout.right.forEach(cardId => {
                const card = document.getElementById(cardId);
                if(card) DOMElements.rightColumn.appendChild(card);
            });
        }
    }
    
    async function fetchAndDisplayMetar(stationUrl) {
        DOMElements.metarContainer.innerHTML = '<div class="text-subtle">Loading station data...</div>';
        try {
            const response = await fetch(stationUrl);
            if (!response.ok) throw new Error('Station data fetch failed.');
            const observationData = await response.json();
            displayMetar(observationData);
        } catch (e) {
            DOMElements.metarContainer.innerHTML = `<p class="text-subtle">Could not load station data.</p>`;
            console.error("METAR fetch error:", e);
        }
    }

    function toggleMapFullscreen() {
        const mapCard = DOMElements.mapCard;
        const isFullscreen = document.body.classList.toggle('fullscreen-active');
        
        if (isFullscreen) {
            originalParent = mapCard.parentNode;
            originalNextSibling = mapCard.nextSibling;
            document.body.appendChild(mapCard);
            mapCard.classList.add('map-fullscreen-container');
        } else {
            if (originalParent) {
                originalParent.insertBefore(mapCard, originalNextSibling);
            }
            mapCard.classList.remove('map-fullscreen-container');
        }
        
        const icon = isFullscreen ? 'minimize' : 'maximize';
        DOMElements.fullscreenMapBtn.innerHTML = `<i data-lucide="${icon}"></i>`;
        lucide.createIcons();
        
        setTimeout(() => { if (map) map.invalidateSize(); }, 150);
    }

    async function initializeOrUpdateMap(lat,lon, stations=[]){
        const mapTheme=settings.theme==='light'?'light_all':'dark_all';
        if(!map){
            map=L.map('map').setView([lat,lon],7);
            baseMapLayer=L.tileLayer(`https://{s}.basemaps.cartocdn.com/${mapTheme}/{z}/{x}/{y}{r}.png`,{attribution:'&copy; CARTO &copy; OpenStreetMap',subdomains:'abcd',maxZoom:20}).addTo(map);
            setupMapLayers(lat,lon);
            map.on('click', async (e) => {
                const { lat, lng } = e.latlng;
                if(clickMarker) map.removeLayer(clickMarker);
                clickMarker = L.circleMarker([lat, lng], { radius: 6, color: '#3b82f6', fillOpacity: 1 }).addTo(map);
                
                try {
                    const r = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${OPENCAGE_API_KEY}&limit=1`);
                    const d = await r.json();
                    const locName = (r.ok && d.results.length > 0) ? d.results[0].formatted : 'Selected Location';
                    getWeatherForCoords(lat, lng, locName);
                } catch {
                     getWeatherForCoords(lat, lng, 'Selected Location');
                }
            });
        }else{map.setView([lat,lon],7);}
        if(mapMarker){mapMarker.setLatLng([lat,lon]);}else{mapMarker=L.marker([lat,lon],{icon:L.divIcon({html:`<i data-lucide="map-pin" class="text-blue-500" style="font-size:32px;"></i>`,className:'',iconSize:[32,32],iconAnchor:[16,32]})}).addTo(map);}
        stationMarkers.forEach(m => map.removeLayer(m)); stationMarkers = [];
        if(stations) {
            stations.forEach(s => {
                if(s.geometry && s.geometry.coordinates) {
                    const [lon, lat] = s.geometry.coordinates;
                    const marker = L.circleMarker([lat, lon], { radius: 5, color: '#f59e0b' }).addTo(map);
                    marker.bindTooltip(`${s.properties.stationIdentifier}<br>${s.properties.name}`);
                    marker.on('click', () => fetchAndDisplayMetar(`${s.id}/observations/latest`));
                    stationMarkers.push(marker);
                }
            });
        }
        try{const response=await fetch('https://api.rainviewer.com/public/weather-maps.json');const data=await response.json();const radarUrl=`https://tilecache.rainviewer.com${data.radar.nowcast[0].path}/512/{z}/{x}/{y}/8/1_1.png`;if(mapLayers.radar)mapLayers.radar.setUrl(radarUrl);else mapLayers.radar=L.tileLayer(radarUrl,{opacity:0.7});}catch(error){console.error("Radar Error:",error);}switchMapLayer(settings.activeMapLayer);lucide.createIcons();
    }
    init();
});
