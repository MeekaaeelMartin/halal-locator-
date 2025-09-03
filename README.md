# Halaal Restaurant Finder SA

Find halaal restaurants across South Africa with Google Maps and Places.

## Prerequisites

- A Google Cloud project with billing enabled
- Enable these APIs for your key:
  - Maps JavaScript API
  - Places API

## Setup

1) Create your API key in Google Cloud Console
2) In this folder, copy `config.example.js` to `config.js`
3) Edit `config.js` and set `window.MAPS_API_KEY = 'YOUR_KEY'`
4) Serve the site locally (opening `index.html` from filesystem may block geolocation)

### Start a local server

From this directory:

```bash
python3 -m http.server 5173
```

Visit `http://localhost:5173`.

## Usage

- Use the search box to enter a city, suburb, or address in South Africa
- Choose a radius, or click "Use my location"
- Click "Search halaal" to find nearby halaal restaurants
- Click a result to focus the map and see details

Notes:

- Results come from Google Places. Always verify halaal status directly with the venue.
- Nearby Search supports pagination via the Next button; results are sorted by distance in the sidebar.

## Deployment

This is a static site. You can host it on any static hosting provider (e.g. GitHub Pages, Netlify, Vercel). Ensure `config.js` is present with a valid API key.


