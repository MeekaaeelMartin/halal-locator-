(() => {
  const southAfricaCenter = { lat: -30.5595, lng: 22.9375 };
  const defaultZoom = 6;

  /** @type {google.maps.Map | null} */
  let map = null;
  /** @type {google.maps.places.PlacesService | null} */
  let placesService = null;
  /** @type {google.maps.InfoWindow | null} */
  let infoWindow = null;
  /** @type {google.maps.Marker[]} */
  let markers = [];
  /** @type {any | null} */
  let markerCluster = null;
  /** @type {null | google.maps.places.PlaceResult[]} */
  let currentResults = null;
  /** @type {null | google.maps.places.PlaceSearchPagination} */
  let pagination = null;
  /** @type {string} */
  let selectedCuisine = '';

  const els = {
    searchInput: document.getElementById('searchInput'),
    radiusSelect: document.getElementById('radiusSelect'),
    useLocationBtn: document.getElementById('useLocationBtn'),
    searchBtn: document.getElementById('searchBtn'),
    clearBtn: document.getElementById('clearBtn'),
    resultsList: document.getElementById('resultsList'),
    pagination: document.getElementById('pagination'),
    statusMsg: document.getElementById('statusMsg'),
    resultsPanel: document.getElementById('resultsPanel'),
    toggleListBtn: document.getElementById('toggleListBtn'),
    closeListBtn: document.getElementById('closeListBtn'),
    filterChips: Array.from(document.querySelectorAll('.chip')),
    includeButcheries: document.getElementById('includeButcheries'),
    detailsPanel: document.getElementById('detailsPanel'),
    detailsContent: document.getElementById('detailsContent'),
    detailsCloseBtn: document.getElementById('detailsCloseBtn')
  };

  function setStatus(message, type = 'info') {
    if (!els.statusMsg) return;
    els.statusMsg.textContent = message || '';
    els.statusMsg.style.color = type === 'error' ? '#ef4444' : 'var(--muted)';
  }

  function loadGoogleMaps() {
    const apiKey = (window).MAPS_API_KEY;
    const region = (window).MAPS_REGION || 'ZA';
    if (!apiKey) {
      setStatus('Missing MAPS_API_KEY in config.js. See README for setup.', 'error');
      return;
    }
    setStatus('Loading Google Maps…');
    const existing = document.querySelector('script[data-google-maps]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&region=${region}&callback=initMap`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'true';
    script.onerror = () => {
      console.error('[Maps] Script failed to load');
      setStatus('Failed to load Google Maps. Check network and API key restrictions.', 'error');
    };
    document.head.appendChild(script);
    (window).initMap = initMap;
  }

  function initMap() {
    try {
      map = new google.maps.Map(document.getElementById('map'), {
        center: southAfricaCenter,
        zoom: defaultZoom,
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: false
      });
    } catch (e) {
      console.error('[Maps] initMap error', e);
      setStatus('Unable to initialize map. See console for details.', 'error');
      return;
    }
    placesService = new google.maps.places.PlacesService(map);
    infoWindow = new google.maps.InfoWindow();

    setupAutocomplete();
    wireEvents();
    wireFilters();
    setStatus('');
  }

  function setupAutocomplete() {
    if (!els.searchInput) return;
    try {
      const autocomplete = new google.maps.places.Autocomplete(els.searchInput, {
        fields: ['geometry', 'name'],
        componentRestrictions: { country: ['za'] }
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place && place.geometry && place.geometry.location) {
          map.setCenter(place.geometry.location);
          map.setZoom(13);
        }
      });
    } catch (e) {
      // Autocomplete may fail without Places library; safe to ignore
    }
  }

  function wireEvents() {
    if (els.useLocationBtn) {
      els.useLocationBtn.addEventListener('click', () => {
        useMyLocation();
      });
    }
    if (els.searchBtn) {
      els.searchBtn.addEventListener('click', () => {
        runSearch();
      });
    }
    if (els.clearBtn) {
      els.clearBtn.addEventListener('click', () => {
        clearResults();
      });
    }

    // Mobile results panel toggle
    if (els.toggleListBtn && els.resultsPanel) {
      els.toggleListBtn.addEventListener('click', () => {
        els.resultsPanel.classList.toggle('open');
        const isOpen = els.resultsPanel.classList.contains('open');
        els.resultsPanel.setAttribute('aria-hidden', String(!isOpen));
        els.toggleListBtn.setAttribute('aria-expanded', String(isOpen));
      });
    }
    if (els.closeListBtn && els.resultsPanel) {
      els.closeListBtn.addEventListener('click', () => {
        els.resultsPanel.classList.remove('open');
        els.resultsPanel.setAttribute('aria-hidden', 'true');
        if (els.toggleListBtn) els.toggleListBtn.setAttribute('aria-expanded', 'false');
      });
    }
    if (els.detailsCloseBtn && els.detailsPanel) {
      els.detailsCloseBtn.addEventListener('click', () => closeDetails());
    }
  }

  function wireFilters() {
    if (!els.filterChips || !els.filterChips.length) return;
    els.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        els.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedCuisine = chip.dataset.filter || '';
        runSearch();
      });
    });
    if (els.includeButcheries) {
      els.includeButcheries.addEventListener('change', () => runSearch());
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus('Geolocation not supported by your browser.', 'error');
      return;
    }
    setStatus('Locating…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        map.setCenter(position);
        map.setZoom(14);
        setStatus('');
        runSearch();
      },
      (err) => {
        setStatus('Unable to retrieve your location. You can still search by area.', 'error');
        console.error(err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  function clearResults() {
    markers.forEach(m => m.setMap(null));
    markers = [];
    if (els.resultsList) els.resultsList.innerHTML = '';
    if (els.pagination) els.pagination.innerHTML = '';
    currentResults = null;
    pagination = null;
    setStatus('');
  }

  function runSearch() {
    if (!map || !placesService) return;
    clearResults();

    const center = map.getCenter();
    const radiusMeters = parseInt(els.radiusSelect.value, 10) || 5000;
    setStatus('Searching for halaal restaurants…');

    const request = {
      location: center,
      radius: radiusMeters,
      keyword: selectedCuisine ? `halaal ${selectedCuisine}` : 'halaal',
      type: 'restaurant'
    };

    // Helper to merge butcheries if toggled
    const maybeMergeButcheries = (baseResults, done) => {
      if (!els.includeButcheries || !els.includeButcheries.checked) return done(baseResults);
      const butchReq = { location: center, radius: radiusMeters, keyword: 'halaal butchery', type: 'store' };
      placesService.nearbySearch(butchReq, (br, bs) => {
        if (bs === google.maps.places.PlacesServiceStatus.OK && br && br.length) {
          done([...(baseResults||[]), ...br]);
        } else {
          done(baseResults);
        }
      });
    };

    // Primary search: keyword "halaal"
    placesService.nearbySearch(request, (results, status, pag) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length) {
        maybeMergeButcheries(results, (merged) => handleResults(merged, pag));
        return;
      }
      console.warn('[Places] nearbySearch halaal status', status, results);
      // Fallback 1: try keyword "halal"
      const requestHalal = { ...request, keyword: 'halal' };
      placesService.nearbySearch(requestHalal, (res2, status2, pag2) => {
        if (status2 === google.maps.places.PlacesServiceStatus.OK && res2 && res2.length) {
          maybeMergeButcheries(res2, (merged) => handleResults(merged, pag2));
          setStatus(`${res2.length} result(s) loaded (halal).`);
          return;
        }
        console.warn('[Places] nearbySearch halal status', status2, res2);
        // Fallback 2: textSearch within bounds
        const query = 'halaal restaurant';
        const bounds = map.getBounds();
        const textReq = bounds ? { query, bounds } : { query, location: center, radius: radiusMeters };
        placesService.textSearch(textReq, (res3, status3, pag3) => {
          if (status3 === google.maps.places.PlacesServiceStatus.OK && res3 && res3.length) {
            maybeMergeButcheries(res3, (merged) => handleResults(merged, pag3));
            setStatus(`${res3.length} result(s) loaded (text search).`);
            return;
          }
          console.warn('[Places] textSearch status', status3, res3);
          setStatus(`No results. Status: ${status3}. Try a larger radius or different area.`, 'error');
        });
      });
    });
  }

  function handleResults(results, pag) {
    currentResults = results;
    pagination = pag || null;
    renderResults(results);
    setStatus(`${results.length} result(s) loaded${pag && pag.hasNextPage ? ' (more available)' : ''}.`);
    renderPagination();
    // Auto open results on mobile
    if (els.resultsPanel && window.matchMedia('(max-width: 900px)').matches) {
      els.resultsPanel.classList.add('open');
      els.resultsPanel.setAttribute('aria-hidden', 'false');
      if (els.toggleListBtn) els.toggleListBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function renderPagination() {
    if (!els.pagination) return;
    els.pagination.innerHTML = '';
    if (!pagination) return;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Prev';
    prevBtn.className = 'btn';
    prevBtn.disabled = true; // Nearby Search only supports next page

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.className = 'btn';
    nextBtn.disabled = !pagination.hasNextPage;
    nextBtn.addEventListener('click', () => {
      setStatus('Loading more results…');
      pagination.nextPage();
    });

    els.pagination.appendChild(prevBtn);
    els.pagination.appendChild(nextBtn);
  }

  function renderResults(results) {
    if (!map || !results) return;
    const bounds = new google.maps.LatLngBounds();

    const newMarkers = [];
    results.forEach((place, index) => {
      if (!place.geometry || !place.geometry.location) return;
      const position = place.geometry.location;
      bounds.extend(position);

      const marker = new google.maps.Marker({
        map,
        position,
        title: place.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#2dd4bf',
          fillOpacity: 0.95,
          strokeColor: '#0f766e',
          strokeWeight: 2
        }
      });
      markers.push(marker);
      newMarkers.push(marker);

      marker.addListener('click', () => onMarkerClick(place, marker));
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 60);
    }

    // Marker clustering
    try {
      if (window.markerClusterer && window.markerClusterer.clearMarkers) {
        window.markerClusterer.clearMarkers();
      }
      if (markerCluster && markerCluster.clearMarkers) {
        markerCluster.clearMarkers();
      }
      if (window.MarkerClusterer && newMarkers.length) {
        markerCluster = new window.MarkerClusterer({ map, markers: newMarkers });
      }
    } catch (e) {
      // clustering optional
    }

    renderList(results);
  }

  function onMarkerClick(place, marker) {
    // If we have place_id, get details, open infowindow and slide-out panel
    if (place.place_id) {
      try {
        placesService.getDetails({ placeId: place.place_id, fields: ['name','formatted_address','formatted_phone_number','website','opening_hours','rating','user_ratings_total','photos','url','geometry','place_id','reviews','editorial_summary'] }, (detail, status) => {
          const p = status === google.maps.places.PlacesServiceStatus.OK && detail ? detail : place;
          infoWindow.setContent(renderInfoContent(p));
          infoWindow.open(map, marker);
          openDetails(p);
        });
        return;
      } catch (e) {
        // fall through to basic content
      }
    }
    // Show basic content
    infoWindow.setContent(renderInfoContent(place));
    infoWindow.open(map, marker);
    openDetails(place);
  }

  function distanceMeters(a, b) {
    const R = 6371000; // meters
    const dLat = (b.lat() - a.lat()) * Math.PI / 180;
    const dLng = (b.lng() - a.lng()) * Math.PI / 180;
    const lat1 = a.lat() * Math.PI / 180;
    const lat2 = b.lat() * Math.PI / 180;
    const x = dLng * Math.cos((lat1 + lat2) / 2);
    const y = dLat;
    return Math.sqrt(x * x + y * y) * R;
  }

  function renderList(results) {
    if (!els.resultsList || !map) return;
    els.resultsList.innerHTML = '';
    const center = map.getCenter();

    results
      .map(place => ({
        place,
        dist: place.geometry && place.geometry.location ? distanceMeters(center, place.geometry.location) : Infinity
      }))
      .sort((a, b) => a.dist - b.dist)
      .forEach(({ place, dist }, idx) => {
        const li = document.createElement('li');
        li.className = 'result-item';

        const title = document.createElement('h3');
        title.className = 'result-title';
        title.textContent = place.name || 'Unknown';

        const meta1 = document.createElement('div');
        meta1.className = 'result-meta';
        meta1.textContent = place.vicinity || place.formatted_address || '';

        const meta2 = document.createElement('div');
        meta2.className = 'result-meta';
        const km = isFinite(dist) ? (dist / 1000).toFixed(1) + ' km' : '';
        const rating = place.rating ? `Rating ${place.rating.toFixed(1)}${place.user_ratings_total ? ` (${place.user_ratings_total})` : ''}` : 'No rating';
        meta2.textContent = [km, rating].filter(Boolean).join(' • ');

        const halal = document.createElement('span');
        halal.className = 'badge';
        halal.textContent = 'halaal';

        title.appendChild(halal);
        li.appendChild(title);
        li.appendChild(meta1);
        li.appendChild(meta2);

        // Open on click
        li.addEventListener('click', () => {
          const marker = markers.find(m => m.getTitle() === place.name);
          if (marker) {
            map.panTo(marker.getPosition());
            map.setZoom(Math.max(map.getZoom(), 15));
            onMarkerClick(place, marker);
          }
        });

        // Save button
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn tertiary';
        saveBtn.style.padding = '6px 10px';
        saveBtn.style.fontSize = '12px';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const saved = JSON.parse(localStorage.getItem('savedPlaces')||'[]');
          const item = { name: place.name, address: place.vicinity || place.formatted_address || '', placeId: place.place_id || '' };
          if (!saved.some(s => s.placeId === item.placeId && item.placeId)) saved.push(item);
          localStorage.setItem('savedPlaces', JSON.stringify(saved));
          setStatus('Saved to your list.');
        });

        li.appendChild(saveBtn);

        els.resultsList.appendChild(li);
      });
  }

  function renderInfoContent(place) {
    const name = place.name || '';
    const addr = place.vicinity || place.formatted_address || '';
    const rating = place.rating ? `${place.rating.toFixed(1)}★` : '';
    const total = place.user_ratings_total ? `(${place.user_ratings_total})` : '';
    const openNow = place.opening_hours && typeof place.opening_hours.isOpen === 'function' ? (place.opening_hours.isOpen() ? 'Open' : 'Closed') : '';
    const phone = place.formatted_phone_number || '';
    const website = place.website || '';
    const placeId = place.place_id || '';
    let photoUrl = '';
    try {
      if (place.photos && place.photos.length) {
        photoUrl = place.photos[0].getUrl({ maxWidth: 400, maxHeight: 250 });
      }
    } catch (e) {}
    const directions = placeId ? `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(placeId)}` : (addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : '');
    const detailsHref = placeId ? (() => { const u = new URL(location.origin + '/details.html'); u.searchParams.set('placeId', placeId); u.searchParams.set('name', name); return u.toString(); })() : '';
    return `
      <div style="min-width:260px;max-width:320px">
        ${photoUrl ? `<div style=\"margin-bottom:8px\"><img alt=\"${escapeHtml(name)}\" src=\"${photoUrl}\" style=\"width:100%;border-radius:10px\"/></div>` : ''}
        <div style="font-weight:700;margin-bottom:4px">${escapeHtml(name)}</div>
        <div style="color:#64748b;font-size:12px;margin-bottom:6px">${escapeHtml(addr)}</div>
        <div style="font-size:12px;margin-bottom:8px">${rating} ${total} ${openNow}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          ${directions ? `<a target=\"_blank\" rel=\"noopener\" href=\"${directions}\" class=\"btn primary\" style=\"padding:6px 10px;border-radius:8px;font-size:12px\">Directions</a>` : ''}
          ${phone ? `<a href=\"tel:${phone.replace(/\s/g,'')}\" class=\"btn secondary\" style=\"padding:6px 10px;border-radius:8px;font-size:12px\">Call</a>` : ''}
          ${website ? `<a target=\"_blank\" rel=\"noopener\" href=\"${website}\" class=\"btn tertiary\" style=\"padding:6px 10px;border-radius:8px;font-size:12px\">Website</a>` : ''}
        </div>
        ${detailsHref ? `<div><a class=\"btn tertiary\" href=\"${detailsHref}\" style=\"padding:6px 10px;border-radius:8px;font-size:12px\">More info</a></div>` : ''}
      </div>
    `;
  }

  function openDetails(place) {
    if (!els.detailsPanel || !els.detailsContent) return;
    const dist = map && place.geometry && place.geometry.location ? (distanceMeters(map.getCenter(), place.geometry.location) / 1000).toFixed(1) + ' km' : '';
    const photoUrl = (place.photos && place.photos.length) ? (() => { try { return place.photos[0].getUrl({ maxWidth: 700 }); } catch(e) { return ''; } })() : '';
    const reviews = Array.isArray(place.reviews) ? place.reviews.slice(0,3) : [];
    const desc = place.editorial_summary && place.editorial_summary.overview ? place.editorial_summary.overview : '';
    els.detailsContent.innerHTML = `
      ${photoUrl ? `<img src="${photoUrl}" alt="${escapeHtml(place.name||'')}" style="width:100%;border-radius:12px; margin-bottom:10px"/>` : ''}
      <div style="display:flex;flex-direction:column;gap:6px">
        <div><strong>${escapeHtml(place.name||'')}</strong></div>
        <div class="muted">${escapeHtml(place.formatted_address||'')}</div>
        <div class="muted">${desc ? escapeHtml(desc) : ''}</div>
        <div>${place.rating ? `${place.rating.toFixed(1)}★` : ''} ${place.user_ratings_total ? `(${place.user_ratings_total})` : ''} ${dist ? `• ${dist} from center` : ''}</div>
        ${place.opening_hours && place.opening_hours.weekday_text ? `<div><details><summary>Opening hours</summary><div class="muted">${place.opening_hours.weekday_text.map(escapeHtml).join('<br/>')}</div></details></div>` : ''}
        ${reviews.length ? `<div><h3 style="margin:10px 0 6px;font-size:14px">Recent reviews</h3>${reviews.map(r => `<div style=\"margin-bottom:8px\"><div style=\"font-weight:600\">${escapeHtml(r.author_name||'')}</div><div class=\"muted\" style=\"font-size:12px\">${escapeHtml(r.text||'')}</div></div>`).join('')}</div>` : ''}
      </div>
    `;
    els.detailsPanel.classList.add('open');
    els.detailsPanel.setAttribute('aria-hidden','false');
  }

  function closeDetails() {
    if (!els.detailsPanel) return;
    els.detailsPanel.classList.remove('open');
    els.detailsPanel.setAttribute('aria-hidden','true');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', loadGoogleMaps);
})();


