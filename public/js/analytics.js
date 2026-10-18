/* Admin analytics: Chart.js charts and a Leaflet map. The data arrives as a JSON block in the page
   (not executable, so it passes the content-security policy). Colours come from the CSS tokens,
   so the charts follow the light/dark theme. */
(function () {
  'use strict';
  var holder = document.getElementById('analytics-data');
  if (!holder) return;
  var data;
  try { data = JSON.parse(holder.textContent); } catch (e) { return; }

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var charts = [];
  var map = null;

  function token(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function buildCharts() {
    if (!window.Chart) return;
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
    var text = token('--text');
    var muted = token('--muted');
    var grid = token('--border');
    var lostColor = token('--btn-bg');
    var foundColor = token('--bar');

    Chart.defaults.color = muted;
    Chart.defaults.font.family = token('--font-body');
    Chart.defaults.borderColor = grid;

    var base = { responsive: true, maintainAspectRatio: false, animation: reduceMotion ? false : undefined, plugins: { legend: { position: 'bottom', labels: { color: text } } } };
    var counts = { beginAtZero: true, ticks: { precision: 0 }, grid: { color: grid } };

    var monthly = document.getElementById('chart-monthly');
    if (monthly) {
      charts.push(new Chart(monthly, {
        type: 'bar',
        data: {
          labels: data.monthly.map(function (m) { return m.label; }),
          datasets: [
            { label: data.labels.lost, data: data.monthly.map(function (m) { return m.lost; }), backgroundColor: lostColor },
            { label: data.labels.found, data: data.monthly.map(function (m) { return m.found; }), backgroundColor: foundColor }
          ]
        },
        options: Object.assign({}, base, { scales: { y: counts, x: { grid: { display: false } } } })
      }));
    }

    var status = document.getElementById('chart-status');
    if (status) {
      charts.push(new Chart(status, {
        type: 'bar',
        data: { labels: data.byStatus.map(function (s) { return s.label; }), datasets: [{ label: data.labels.cases, data: data.byStatus.map(function (s) { return s.count; }), backgroundColor: lostColor }] },
        options: Object.assign({}, base, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: counts, y: { grid: { display: false } } } })
      }));
    }

    var category = document.getElementById('chart-category');
    if (category) {
      charts.push(new Chart(category, {
        type: 'bar',
        data: {
          labels: data.byCategory.map(function (c) { return c.label; }),
          datasets: [
            { label: data.labels.lost, data: data.byCategory.map(function (c) { return c.lost; }), backgroundColor: lostColor },
            { label: data.labels.found, data: data.byCategory.map(function (c) { return c.found; }), backgroundColor: foundColor }
          ]
        },
        options: Object.assign({}, base, { indexAxis: 'y', scales: { x: Object.assign({}, counts, { stacked: true }), y: { stacked: true, grid: { display: false } } } })
      }));
    }
  }

  function buildMap() {
    var box = document.getElementById('hotspot-map');
    if (!box || !window.L) return;
    var points = data.hotspots.filter(function (h) { return typeof h.lat === 'number' && typeof h.lng === 'number'; });
    if (!points.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = data.labels.noMap;
      box.appendChild(p);
      return;
    }
    map = L.map(box, { scrollWheelZoom: false }).setView([data.campus.lat, data.campus.lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    var bounds = [];
    points.forEach(function (h) {
      var tip = document.createElement('span');
      tip.textContent = h.label + ': ' + h.count;
      L.circleMarker([h.lat, h.lng], { radius: Math.min(30, 8 + 4 * Math.sqrt(h.count)), color: '#2e2a78', weight: 2, fillColor: '#16a9b8', fillOpacity: 0.55 }).bindTooltip(tip).addTo(map);
      bounds.push([h.lat, h.lng]);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
  }

  function init() { buildCharts(); buildMap(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('sf:theme', buildCharts);
})();
